"""Borda HTTP para análise, identidade, equipes e sincronização central."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth_service import (
    authenticate_refresh_session, create_access_token, create_refresh_session,
    hash_password, normalize_email, read_access_token, require_team_admin,
    require_team_member, revoke_refresh_session, user_payload, verify_password,
)
from app.config import get_settings
from app.database import Base, database_url, engine, get_session
from app.engine import AnalysisEntry, analyze_entries
from app.persistence import InventoryEntryRow, InventoryRow, TeamMemberRow, TeamRow, UserRow
from app.reports import build_consolidated_report, export_docx, export_pdf, export_xlsx
from app.schemas import (
    AddTeamMemberRequest, AnalysisPreviewRequest, AnalysisReport, AuthResponse,
    AuthenticatedUser, CreateTeamRequest, LoginRequest, RegisterRequest, SyncRequest,
    SyncResponse, FinalizeInventoryRequest, InventoryHistoryItem,
)
from app.sync_service import (
    SyncAuthorizationError,
    SyncFinalizationRequiredError,
    SyncFinalizedError,
    SyncNotFoundError,
    synchronize,
)


REFRESH_COOKIE = "inventory_refresh"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # SQLite é somente conveniência local; PostgreSQL é preparado somente por
    # Alembic antes de iniciar o processo de produção.
    if database_url().startswith("sqlite"):
        Base.metadata.create_all(engine)
    yield


settings = get_settings()
app = FastAPI(title="Inventário — análise e sincronização", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Inventory-Sync-Token"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE, value=token, httponly=True, secure=settings.is_production,
        samesite="strict", max_age=settings.refresh_session_days * 24 * 60 * 60,
        path="/",
    )


def _auth_response(session: Session, user: UserRow, response: Response) -> dict[str, object]:
    refresh = create_refresh_session(session, user, settings)
    session.commit()
    _set_refresh_cookie(response, refresh)
    return {"accessToken": create_access_token(user, settings), "user": user_payload(session, user)}


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: Session = Depends(get_session),
) -> UserRow:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticação obrigatória.")
    user_id = read_access_token(authorization.removeprefix("Bearer "), settings)
    user = session.get(UserRow, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    return user


def _sync_team(session: Session, user: UserRow, requested_team_id: str | None) -> str:
    if requested_team_id:
        require_team_member(session, user.id, requested_team_id)
        return requested_team_id
    memberships = session.scalars(select(TeamMemberRow).where(TeamMemberRow.user_id == user.id)).all()
    if len(memberships) != 1:
        raise HTTPException(status_code=422, detail="Selecione uma equipe antes de sincronizar.")
    return memberships[0].team_id


@app.get("/healthz")
def healthz() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Serviço indisponível.") from error
    return {"status": "ok"}


@app.post("/api/v1/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, session: Session = Depends(get_session)) -> dict[str, object]:
    email = normalize_email(payload.email)
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Informe um e-mail válido.")
    if session.scalar(select(UserRow).where(UserRow.email == email)) is not None:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.")
    now = datetime.now(timezone.utc)
    user = UserRow(id=str(uuid4()), email=email, display_name=payload.displayName.strip(), password_hash=hash_password(payload.password), created_at=now)
    team = TeamRow(id=str(uuid4()), name=payload.teamName.strip(), created_by_user_id=user.id, created_at=now)
    membership = TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=user.id, role="ADMIN", created_at=now)
    try:
        # Os mapeamentos não possuem relationships ORM; flushes explícitos garantem
        # a ordem das FKs no PostgreSQL (users -> teams -> team_members).
        session.add(user)
        session.flush()
        session.add(team)
        session.flush()
        session.add(membership)
        session.flush()
        return _auth_response(session, user, response)
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível criar a conta.") from error


@app.post("/api/v1/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, session: Session = Depends(get_session)) -> dict[str, object]:
    user = session.scalar(select(UserRow).where(UserRow.email == normalize_email(payload.email)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos.")
    return _auth_response(session, user, response)


@app.post("/api/v1/auth/refresh", response_model=AuthResponse)
def refresh(
    response: Response, refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    user = authenticate_refresh_session(session, refresh_token)
    revoke_refresh_session(session, refresh_token)
    return _auth_response(session, user, response)


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response, refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    session: Session = Depends(get_session),
) -> Response:
    if refresh_token:
        revoke_refresh_session(session, refresh_token)
    response.delete_cookie(REFRESH_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@app.get("/api/v1/auth/me", response_model=AuthenticatedUser)
def me(user: UserRow = Depends(get_current_user), session: Session = Depends(get_session)) -> dict[str, object]:
    return user_payload(session, user)


@app.post("/api/v1/teams", response_model=AuthenticatedUser, status_code=status.HTTP_201_CREATED)
def create_team(payload: CreateTeamRequest, user: UserRow = Depends(get_current_user), session: Session = Depends(get_session)) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    team = TeamRow(id=str(uuid4()), name=payload.name.strip(), created_by_user_id=user.id, created_at=now)
    membership = TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=user.id, role="ADMIN", created_at=now)
    session.add(team)
    session.flush()
    session.add(membership)
    session.commit()
    return user_payload(session, user)


@app.post("/api/v1/teams/{team_id}/members", response_model=AuthenticatedUser)
def add_team_member(team_id: str, payload: AddTeamMemberRequest, user: UserRow = Depends(get_current_user), session: Session = Depends(get_session)) -> dict[str, object]:
    require_team_admin(session, user.id, team_id)
    target = session.scalar(select(UserRow).where(UserRow.email == normalize_email(payload.email)))
    if target is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if session.scalar(select(TeamMemberRow).where(TeamMemberRow.team_id == team_id, TeamMemberRow.user_id == target.id)):
        raise HTTPException(status_code=409, detail="Este usuário já pertence à equipe.")
    session.add(TeamMemberRow(id=str(uuid4()), team_id=team_id, user_id=target.id, role=payload.role, created_at=datetime.now(timezone.utc)))
    session.commit()
    return user_payload(session, user)


@app.post("/api/v1/analysis/preview", response_model=AnalysisReport)
def preview_analysis(payload: AnalysisPreviewRequest) -> dict[str, object]:
    return analyze_entries(
        inventory_id=str(payload.inventory.id), revision=payload.inventory.revision,
        entries=(AnalysisEntry(side=entry.side, bay=entry.bay, lot=entry.lot, quantity=entry.quantity) for entry in payload.entries),
    )


def _inventory_access(session: Session, inventory_id: str, sync_token: str, user: UserRow) -> InventoryRow:
    inventory = session.get(InventoryRow, inventory_id)
    if inventory is None or inventory.team_id is None:
        raise HTTPException(status_code=404, detail="Inventário central não encontrado.")
    require_team_member(session, user.id, inventory.team_id)
    from app.sync_service import _hash_token
    import hmac
    if not hmac.compare_digest(inventory.sync_token_hash, _hash_token(sync_token)):
        raise HTTPException(status_code=403, detail="Código de sincronização inválido.")
    return inventory


def _central_report(session: Session, inventory: InventoryRow) -> dict[str, object]:
    if inventory.report_snapshot is not None:
        return inventory.report_snapshot
    rows = session.scalars(
        select(InventoryEntryRow).where(
            InventoryEntryRow.inventory_id == inventory.id,
            InventoryEntryRow.tombstone.is_(False),
        )
    ).all()
    return build_consolidated_report(
        inventory.id, inventory.date.isoformat(), inventory.revision,
        (AnalysisEntry(side=row.side, bay=row.bay, lot=row.lot, quantity=row.quantity) for row in rows),
    )


def _history_item(inventory: InventoryRow) -> dict[str, object]:
    snapshot = inventory.report_snapshot or {}
    return {
        "id": inventory.id,
        "date": inventory.date.isoformat(),
        "status": inventory.status,
        "revision": inventory.revision,
        "finalizedAt": inventory.finalized_at.isoformat() if inventory.finalized_at else None,
        "summary": snapshot.get("summary"),
    }


@app.post("/api/v1/inventories/{inventory_id}/finalize", response_model=InventoryHistoryItem)
def finalize_inventory(
    inventory_id: str,
    payload: FinalizeInventoryRequest,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    inventory = _inventory_access(session, inventory_id, sync_token, user)
    if inventory.status == "FINISHED":
        return _history_item(inventory)
    if payload.revision != inventory.revision:
        raise HTTPException(status_code=409, detail="O inventário central mudou; sincronize antes de finalizar.")
    rows = session.scalars(select(InventoryEntryRow).where(InventoryEntryRow.inventory_id == inventory.id, InventoryEntryRow.tombstone.is_(False))).all()
    if not rows:
        raise HTTPException(status_code=422, detail="Registre ao menos um lançamento antes de finalizar.")
    now = datetime.now(timezone.utc)
    inventory.report_snapshot = build_consolidated_report(
        inventory.id, inventory.date.isoformat(), inventory.revision + 1,
        (AnalysisEntry(side=row.side, bay=row.bay, lot=row.lot, quantity=row.quantity) for row in rows), now,
    )
    inventory.status = "FINISHED"
    inventory.finalized_at = now
    inventory.updated_at = now
    inventory.revision += 1
    from app.sync_service import _append_event
    _append_event(session, inventory.id, "inventory", inventory.id)
    session.commit()
    return _history_item(inventory)


@app.get("/api/v1/inventories/history", response_model=list[InventoryHistoryItem])
def inventory_history(
    team_id: str = Query(alias="teamId"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, object]]:
    require_team_member(session, user.id, team_id)
    rows = session.scalars(select(InventoryRow).where(InventoryRow.team_id == team_id, InventoryRow.status == "FINISHED", InventoryRow.tombstone.is_(False)).order_by(InventoryRow.finalized_at.desc())).all()
    return [_history_item(row) for row in rows]


@app.get("/api/v1/inventories/{inventory_id}/report")
def inventory_report(
    inventory_id: str,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    return _central_report(session, _inventory_access(session, inventory_id, sync_token, user))


@app.get("/api/v1/inventories/{inventory_id}/exports/{format_name}")
def inventory_export(
    inventory_id: str,
    format_name: str,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    report = _central_report(session, _inventory_access(session, inventory_id, sync_token, user))
    date_value = str(report["inventoryDate"])
    suffix = f"{date_value[8:10]}-{date_value[5:7]}-{date_value[0:4]}"
    if format_name == "xlsx":
        content, media_type, extension = export_xlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    elif format_name == "pdf":
        content, media_type, extension = export_pdf(report), "application/pdf", "pdf"
    elif format_name == "docx":
        content, media_type, extension = export_docx(report), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
    else:
        raise HTTPException(status_code=404, detail="Formato de exportação não encontrado.")
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="Inventario_{suffix}.{extension}"'})


@app.post("/api/v1/sync", response_model=SyncResponse)
def sync(
    payload: SyncRequest,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    try:
        team_id = _sync_team(session, user, str(payload.teamId) if payload.teamId else None)
        return synchronize(session, payload, sync_token, team_id=team_id, actor_user_id=user.id)
    except SyncNotFoundError as error:
        session.rollback()
        raise HTTPException(status_code=404, detail="Inventário central não encontrado.") from error
    except SyncAuthorizationError as error:
        session.rollback()
        raise HTTPException(status_code=403, detail="Código de sincronização inválido.") from error
    except SyncFinalizedError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Inventário finalizado não aceita alterações.") from error
    except SyncFinalizationRequiredError as error:
        session.rollback()
        raise HTTPException(status_code=422, detail="A finalização deve ser feita pelo endpoint protegido.") from error
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(status_code=503, detail="Persistência central indisponível.") from error
