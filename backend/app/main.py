"""Borda HTTP para análise, identidade, equipes e sincronização central."""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import smtplib
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import exists, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth_service import (
    authenticate_refresh_session, create_access_token, create_refresh_session,
    consume_auth_code, create_auth_code, hash_password, is_allowed_corporate_email,
    normalize_email, read_access_token, require_team_admin, require_team_member,
    revoke_all_refresh_sessions, revoke_refresh_session, user_payload, verify_password,
)
from app.config import get_settings
from app.database import Base, database_url, engine, get_session
from app.engine import AnalysisEntry, analyze_entries
from app.email_service import EmailAttachment, send_email
from app.persistence import (
    InventoryEntryRow, InventoryParticipantRow, InventoryRow,
    ParticipationAttemptRow, TeamMemberRow, TeamRow, UserRow,
)
from app.reports import build_consolidated_report, export_docx, export_pdf, export_xlsx
from app.schemas import (
    AddTeamMemberRequest, AnalysisPreviewRequest, AnalysisReport, AuthResponse,
    AuthenticatedUser, ConfirmPasswordResetRequest, CreateTeamRequest, EmailCodeRequest,
    EmailReportRequest, FinalizeInventoryRequest, InventoryHistoryItem, JoinInventoryRequest,
    JoinInventoryResponse, LoginRequest, MessageResponse, RegisterRequest, SyncEntry, SyncRequest,
    SyncResponse, VerifyEmailRequest,
)
from app.share_service import (
    SHAREABLE_FORMATS,
    create_export_share_signature,
    validate_export_share_signature,
)
from app.sync_service import (
    SyncAuthorizationError,
    SyncFinalizationRequiredError,
    SyncFinalizedError,
    SyncNotFoundError,
    _entry_record,
    synchronize,
)


REFRESH_COOKIE = "inventory_refresh"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if database_url().startswith("sqlite"):
        Base.metadata.create_all(engine)
    yield


settings = get_settings()
app = FastAPI(title="Inventário — análise e sincronização", version="0.5.0", lifespan=lifespan)
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
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="strict",
        max_age=settings.refresh_session_days * 24 * 60 * 60,
        path="/",
    )


def _auth_response(session: Session, user: UserRow, response: Response) -> dict[str, object]:
    if user.email_verified_at is None or not is_allowed_corporate_email(user.email):
        raise HTTPException(status_code=403, detail="Confirme seu e-mail antes de entrar.")
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
    if user is None or user.email_verified_at is None or not is_allowed_corporate_email(user.email):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    return user


def _sync_team(session: Session, user: UserRow, requested_team_id: str | None) -> str | None:
    if requested_team_id:
        require_team_member(session, user.id, requested_team_id)
        return requested_team_id
    memberships = session.scalars(select(TeamMemberRow).where(TeamMemberRow.user_id == user.id)).all()
    if not memberships:
        return None
    if len(memberships) != 1:
        raise HTTPException(status_code=422, detail="Selecione uma equipe antes de sincronizar.")
    return memberships[0].team_id


def _send_code(session: Session, user: UserRow, *, purpose: str) -> None:
    is_verification = purpose == "EMAIL_VERIFICATION"
    code = create_auth_code(
        session,
        user,
        settings,
        purpose=purpose,
        validity_minutes=settings.verification_code_minutes if is_verification else settings.password_reset_code_minutes,
    )
    subject = "Código de verificação do INVENTARIO" if is_verification else "Código para redefinir sua senha"
    action = "confirmar sua conta" if is_verification else "redefinir sua senha"
    validity = settings.verification_code_minutes if is_verification else settings.password_reset_code_minutes
    try:
        send_email(
            settings,
            recipient=user.email,
            subject=subject,
            text=f"Use o código {code} para {action}. Ele expira em {validity} minutos e possui limite de tentativas.",
        )
    except (OSError, smtplib.SMTPException, RuntimeError) as error:
        raise HTTPException(status_code=503, detail="Serviço de e-mail indisponível no momento.") from error


@app.get("/healthz")
def healthz() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Serviço indisponível.") from error
    return {"status": "ok"}


@app.post("/api/v1/auth/register", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    email = normalize_email(payload.email)
    if not is_allowed_corporate_email(email):
        raise HTTPException(status_code=422, detail="Informe um endereço de e-mail válido.")
    if session.scalar(select(UserRow).where(UserRow.email == email)) is not None:
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado.")
    now = datetime.now(timezone.utc)
    user = UserRow(
        id=str(uuid4()),
        email=email,
        display_name=payload.displayName.strip(),
        password_hash=hash_password(payload.password),
        created_at=now,
        email_verified_at=None,
    )
    try:
        session.add(user)
        session.flush()
        _send_code(session, user, purpose="EMAIL_VERIFICATION")
        session.commit()
        return {"message": "Cadastro recebido. Confira o código enviado ao seu e-mail."}
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível criar a conta.") from error


@app.post("/api/v1/auth/verify-email", response_model=AuthResponse)
def verify_email(payload: VerifyEmailRequest, response: Response, session: Session = Depends(get_session)) -> dict[str, object]:
    user = session.scalar(select(UserRow).where(UserRow.email == normalize_email(payload.email)))
    if user is None:
        raise HTTPException(status_code=422, detail="Código inválido, expirado ou bloqueado.")
    if user.email_verified_at is not None:
        raise HTTPException(status_code=409, detail="Esta conta já foi verificada. Entre com sua senha.")
    consume_auth_code(session, user, settings, purpose="EMAIL_VERIFICATION", code=payload.code)
    user.email_verified_at = datetime.now(timezone.utc)
    session.flush()
    return _auth_response(session, user, response)


@app.post("/api/v1/auth/verification/resend", response_model=MessageResponse)
def resend_verification(payload: EmailCodeRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    email = normalize_email(payload.email)
    user = session.scalar(select(UserRow).where(UserRow.email == email))
    if user is not None and user.email_verified_at is None:
        _send_code(session, user, purpose="EMAIL_VERIFICATION")
        session.commit()
    return {"message": "Se a conta estiver pendente, um novo código será enviado."}


@app.post("/api/v1/auth/password-reset/request", response_model=MessageResponse)
def request_password_reset(payload: EmailCodeRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    email = normalize_email(payload.email)
    user = session.scalar(select(UserRow).where(UserRow.email == email))
    if user is not None and user.email_verified_at is not None:
        _send_code(session, user, purpose="PASSWORD_RESET")
        session.commit()
    return {"message": "Se o e-mail estiver cadastrado, o código de recuperação será enviado."}


@app.post("/api/v1/auth/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(payload: ConfirmPasswordResetRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    user = session.scalar(select(UserRow).where(UserRow.email == normalize_email(payload.email)))
    if user is None or user.email_verified_at is None:
        raise HTTPException(status_code=422, detail="Código inválido, expirado ou bloqueado.")
    consume_auth_code(session, user, settings, purpose="PASSWORD_RESET", code=payload.code)
    user.password_hash = hash_password(payload.newPassword)
    revoke_all_refresh_sessions(session, user.id)
    session.commit()
    return {"message": "Senha atualizada. Entre novamente com a nova senha."}


@app.post("/api/v1/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, session: Session = Depends(get_session)) -> dict[str, object]:
    email = normalize_email(payload.email)
    if not is_allowed_corporate_email(email):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos.")
    user = session.scalar(select(UserRow).where(UserRow.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos.")
    if user.email_verified_at is None:
        raise HTTPException(status_code=403, detail="Confirme seu e-mail antes de entrar.")
    return _auth_response(session, user, response)


@app.post("/api/v1/auth/refresh", response_model=AuthResponse)
def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    user = authenticate_refresh_session(session, refresh_token)
    revoke_refresh_session(session, refresh_token)
    return _auth_response(session, user, response)


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
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
def create_team(
    payload: CreateTeamRequest,
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    team = TeamRow(id=str(uuid4()), name=payload.name.strip(), created_by_user_id=user.id, created_at=now)
    membership = TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=user.id, role="ADMIN", created_at=now)
    session.add(team)
    session.flush()
    session.add(membership)
    session.commit()
    return user_payload(session, user)


@app.post("/api/v1/teams/{team_id}/members", response_model=AuthenticatedUser)
def add_team_member(
    team_id: str,
    payload: AddTeamMemberRequest,
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    require_team_admin(session, user.id, team_id)
    target = session.scalar(select(UserRow).where(UserRow.email == normalize_email(payload.email)))
    if target is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if session.scalar(select(TeamMemberRow).where(TeamMemberRow.team_id == team_id, TeamMemberRow.user_id == target.id)):
        raise HTTPException(status_code=409, detail="Este usuário já pertence à equipe.")
    session.add(
        TeamMemberRow(
            id=str(uuid4()),
            team_id=team_id,
            user_id=target.id,
            role=payload.role,
            created_at=datetime.now(timezone.utc),
        )
    )
    session.commit()
    return user_payload(session, user)


@app.post("/api/v1/analysis/preview", response_model=AnalysisReport)
def preview_analysis(payload: AnalysisPreviewRequest) -> dict[str, object]:
    return analyze_entries(
        inventory_id=str(payload.inventory.id),
        revision=payload.inventory.revision,
        entries=(
            AnalysisEntry(side=entry.side, bay=entry.bay, layer=entry.layer, lot=entry.lot, quantity=entry.quantity)
            for entry in payload.entries
        ),
    )


def _authorized_for_inventory(session: Session, inventory: InventoryRow, user: UserRow) -> bool:
    if inventory.owner_user_id == user.id:
        return True
    if inventory.team_id and session.scalar(
        select(TeamMemberRow.id).where(TeamMemberRow.team_id == inventory.team_id, TeamMemberRow.user_id == user.id)
    ):
        return True
    return session.scalar(
        select(InventoryParticipantRow.id).where(
            InventoryParticipantRow.inventory_id == inventory.id,
            InventoryParticipantRow.user_id == user.id,
        )
    ) is not None


def _valid_inventory_token(session: Session, inventory: InventoryRow, user: UserRow, sync_token: str | None) -> bool:
    if not sync_token:
        return False
    from app.sync_service import _hash_token
    import hmac

    token_hash = _hash_token(sync_token)
    if hmac.compare_digest(inventory.sync_token_hash, token_hash):
        return True
    participant_hash = session.scalar(
        select(InventoryParticipantRow.access_token_hash).where(
            InventoryParticipantRow.inventory_id == inventory.id,
            InventoryParticipantRow.user_id == user.id,
        )
    )
    return participant_hash is not None and hmac.compare_digest(participant_hash, token_hash)


def _inventory_access(
    session: Session,
    inventory_id: str,
    user: UserRow,
    sync_token: str | None = None,
    *,
    require_token: bool = False,
) -> InventoryRow:
    inventory = session.get(InventoryRow, inventory_id)
    if inventory is None or inventory.team_id is None:
        raise HTTPException(status_code=404, detail="Inventário central não encontrado.")
    if not _authorized_for_inventory(session, inventory, user):
        raise HTTPException(status_code=404, detail="Inventário central não encontrado.")
    if (require_token or inventory.status != "FINISHED") and not _valid_inventory_token(session, inventory, user, sync_token):
        raise HTTPException(status_code=403, detail="Código de sincronização inválido.")
    return inventory


@app.get("/api/v1/inventories/{inventory_id}/lots/{lot}", response_model=list[SyncEntry])
def inventory_lot_matches(
    inventory_id: str,
    lot: str,
    exclude_entry_id: str | None = Query(default=None, alias="excludeEntryId"),
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, object]]:
    if not lot.isdigit() or len(lot) > 255:
        raise HTTPException(status_code=422, detail="O lote deve conter somente números.")
    inventory = _inventory_access(session, inventory_id, user, sync_token, require_token=True)
    statement = select(InventoryEntryRow).where(
        InventoryEntryRow.inventory_id == inventory.id,
        InventoryEntryRow.lot == lot,
        InventoryEntryRow.tombstone.is_(False),
    )
    if exclude_entry_id:
        statement = statement.where(InventoryEntryRow.id != exclude_entry_id)
    rows = session.scalars(statement.order_by(InventoryEntryRow.created_at)).all()
    return [_entry_record(session, row) for row in rows]


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
        inventory.id,
        inventory.date.isoformat(),
        inventory.revision,
        (
            AnalysisEntry(side=row.side, bay=row.bay, layer=row.layer, lot=row.lot, quantity=row.quantity)
            for row in rows
        ),
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
        "createdByUserId": inventory.owner_user_id,
        "finalizedByUserId": inventory.finalized_by_user_id,
    }


def _export_response(report: dict[str, object], format_name: str) -> Response:
    date_value = str(report["inventoryDate"])
    suffix = f"{date_value[8:10]}-{date_value[5:7]}-{date_value[0:4]}"
    if format_name == "xlsx":
        content = export_xlsx(report)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        extension = "xlsx"
    elif format_name == "pdf":
        content = export_pdf(report)
        media_type = "application/pdf"
        extension = "pdf"
    elif format_name == "docx":
        content = export_docx(report)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        extension = "docx"
    else:
        raise HTTPException(status_code=404, detail="Formato de exportação não encontrado.")
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="Inventario_{suffix}.{extension}"'},
    )


@app.post("/api/v1/inventories/{inventory_id}/finalize", response_model=InventoryHistoryItem)
def finalize_inventory(
    inventory_id: str,
    payload: FinalizeInventoryRequest,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    inventory = _inventory_access(session, inventory_id, user, sync_token, require_token=True)
    if inventory.status == "FINISHED":
        return _history_item(inventory)
    if payload.revision != inventory.revision:
        raise HTTPException(status_code=409, detail="O inventário central mudou; sincronize antes de finalizar.")
    rows = session.scalars(
        select(InventoryEntryRow).where(
            InventoryEntryRow.inventory_id == inventory.id,
            InventoryEntryRow.tombstone.is_(False),
        )
    ).all()
    if not rows:
        raise HTTPException(status_code=422, detail="Registre ao menos um lançamento antes de finalizar.")
    now = datetime.now(timezone.utc)
    inventory.report_snapshot = build_consolidated_report(
        inventory.id,
        inventory.date.isoformat(),
        inventory.revision + 1,
        (
            AnalysisEntry(side=row.side, bay=row.bay, layer=row.layer, lot=row.lot, quantity=row.quantity)
            for row in rows
        ),
        now,
    )
    inventory.status = "FINISHED"
    inventory.finalized_at = now
    inventory.finalized_by_user_id = user.id
    inventory.participation_code = None
    inventory.updated_at = now
    inventory.revision += 1
    from app.sync_service import _append_event

    _append_event(session, inventory.id, "inventory", inventory.id)
    session.commit()
    return _history_item(inventory)


@app.get("/api/v1/inventories/history", response_model=list[InventoryHistoryItem])
def inventory_history(
    scope: str = Query(default="mine", pattern="^(mine|team)$"),
    team_id: str | None = Query(default=None, alias="teamId"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, object]]:
    statement = select(InventoryRow).where(InventoryRow.status == "FINISHED", InventoryRow.tombstone.is_(False))
    if scope == "team":
        if not team_id:
            raise HTTPException(status_code=422, detail="Selecione uma equipe para consultar o histórico.")
        require_team_member(session, user.id, team_id)
        statement = statement.where(InventoryRow.team_id == team_id)
    else:
        statement = statement.where(
            or_(
                InventoryRow.owner_user_id == user.id,
                exists().where(
                    InventoryParticipantRow.inventory_id == InventoryRow.id,
                    InventoryParticipantRow.user_id == user.id,
                ),
            )
        )
    rows = session.scalars(statement.order_by(InventoryRow.finalized_at.desc())).all()
    result = []
    for row in rows:
        item = _history_item(row)
        creator = session.get(UserRow, row.owner_user_id) if row.owner_user_id else None
        finalizer = session.get(UserRow, row.finalized_by_user_id) if row.finalized_by_user_id else None
        item["createdByName"] = creator.display_name if creator else None
        item["finalizedByName"] = finalizer.display_name if finalizer else None
        result.append(item)
    return result


@app.get("/api/v1/inventories/{inventory_id}/report")
def inventory_report(
    inventory_id: str,
    sync_token: str | None = Header(default=None, min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    return _central_report(session, _inventory_access(session, inventory_id, user, sync_token))


@app.get("/api/v1/inventories/{inventory_id}/exports/{format_name}")
def inventory_export(
    inventory_id: str,
    format_name: str,
    sync_token: str | None = Header(default=None, min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Response:
    report = _central_report(session, _inventory_access(session, inventory_id, user, sync_token))
    return _export_response(report, format_name)


@app.post("/api/v1/inventories/{inventory_id}/share-links/{format_name}")
def create_inventory_share_link(
    inventory_id: str,
    format_name: str,
    sync_token: str | None = Header(default=None, min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str | int]:
    inventory = _inventory_access(session, inventory_id, user, sync_token)
    if inventory.status != "FINISHED":
        raise HTTPException(status_code=409, detail="Finalize o inventário antes de compartilhar o arquivo.")
    if format_name not in SHAREABLE_FORMATS:
        raise HTTPException(status_code=404, detail="Formato de compartilhamento não encontrado.")
    expires, signature = create_export_share_signature(
        settings,
        inventory_id=inventory.id,
        format_name=format_name,
    )
    path = (
        f"/api/v1/shared/exports/{inventory.id}/{format_name}"
        f"?expires={expires}&signature={signature}"
    )
    return {"path": path, "expires": expires}


@app.get("/api/v1/shared/exports/{inventory_id}/{format_name}")
def shared_inventory_export(
    inventory_id: str,
    format_name: str,
    expires: int = Query(),
    signature: str = Query(min_length=64, max_length=64),
    session: Session = Depends(get_session),
) -> Response:
    if not validate_export_share_signature(
        settings,
        inventory_id=inventory_id,
        format_name=format_name,
        expires=expires,
        signature=signature,
    ):
        raise HTTPException(status_code=404, detail="Link de compartilhamento inválido ou expirado.")
    inventory = session.get(InventoryRow, inventory_id)
    if (
        inventory is None
        or inventory.status != "FINISHED"
        or inventory.tombstone
        or inventory.report_snapshot is None
    ):
        raise HTTPException(status_code=404, detail="Arquivo compartilhado não encontrado.")
    return _export_response(inventory.report_snapshot, format_name)


@app.post("/api/v1/inventories/join", response_model=JoinInventoryResponse)
def join_inventory(
    payload: JoinInventoryRequest,
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=15)
    recent_failures = session.scalars(
        select(ParticipationAttemptRow.id).where(
            ParticipationAttemptRow.user_id == user.id,
            ParticipationAttemptRow.successful.is_(False),
            ParticipationAttemptRow.created_at >= window_start,
        )
    ).all()
    if len(recent_failures) >= 10:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde 15 minutos para tentar novamente.")

    inventory = session.scalar(
        select(InventoryRow).where(
            InventoryRow.participation_code == payload.code,
            InventoryRow.status == "OPEN",
            InventoryRow.tombstone.is_(False),
        )
    )
    attempt_hash = hashlib.sha256(payload.code.encode("ascii")).hexdigest()
    session.add(
        ParticipationAttemptRow(
            id=str(uuid4()),
            user_id=user.id,
            code_hash=attempt_hash,
            successful=inventory is not None,
            created_at=now,
        )
    )
    if inventory is None:
        session.commit()
        raise HTTPException(status_code=404, detail="Código inválido ou inventário já finalizado.")

    access_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
    participant = session.scalar(
        select(InventoryParticipantRow).where(
            InventoryParticipantRow.inventory_id == inventory.id,
            InventoryParticipantRow.user_id == user.id,
        )
    )
    if participant is None:
        participant = InventoryParticipantRow(
            id=str(uuid4()),
            inventory_id=inventory.id,
            user_id=user.id,
            access_token_hash=token_hash,
            joined_at=now,
            last_accessed_at=now,
        )
        session.add(participant)
    else:
        participant.access_token_hash = token_hash
        participant.last_accessed_at = now
    session.commit()
    return {"inventoryId": inventory.id, "accessToken": access_token}


@app.post("/api/v1/inventories/{inventory_id}/email", response_model=MessageResponse)
def email_inventory_report(
    inventory_id: str,
    payload: EmailReportRequest,
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    inventory = _inventory_access(session, inventory_id, user)
    if inventory.status != "FINISHED":
        raise HTTPException(status_code=409, detail="Finalize o inventário antes de enviar o relatório.")
    report = _central_report(session, inventory)
    date_value = str(report["inventoryDate"])
    suffix = f"{date_value[8:10]}-{date_value[5:7]}-{date_value[0:4]}"
    attachments: list[EmailAttachment] = []
    for format_name in payload.formats:
        if format_name == "pdf":
            attachments.append(EmailAttachment(f"Inventario_{suffix}.pdf", export_pdf(report), "application", "pdf"))
        elif format_name == "xlsx":
            attachments.append(
                EmailAttachment(
                    f"Inventario_{suffix}.xlsx",
                    export_xlsx(report),
                    "application",
                    "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            )
        else:
            attachments.append(
                EmailAttachment(
                    f"Inventario_{suffix}.docx",
                    export_docx(report),
                    "application",
                    "vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            )
    if sum(len(item.content) for item in attachments) > settings.email_attachment_max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Os anexos excedem o limite de envio. Baixe os arquivos separadamente.")
    try:
        send_email(
            settings,
            recipient=user.email,
            subject=f"Relatório do inventário {suffix}",
            text="Os relatórios solicitados estão anexados. Esta mensagem foi enviada pelo aplicativo INVENTARIO.",
            attachments=tuple(attachments),
        )
    except (OSError, smtplib.SMTPException, RuntimeError) as error:
        raise HTTPException(status_code=503, detail="Serviço de e-mail indisponível no momento.") from error
    return {"message": f"Relatório enviado para {user.email}."}


@app.post("/api/v1/sync", response_model=SyncResponse)
def sync(
    payload: SyncRequest,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    try:
        team_id = _sync_team(session, user, str(payload.teamId) if payload.teamId else None)
        if payload.inventory is not None and session.get(InventoryRow, str(payload.inventoryId)) is None and team_id is None:
            raise HTTPException(status_code=422, detail="Sua conta precisa ser associada a uma equipe antes da primeira sincronização.")
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
