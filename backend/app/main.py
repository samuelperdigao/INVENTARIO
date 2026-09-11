"""Borda HTTP para análise, identidade, equipes e sincronização central."""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
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
from app.persistence import TeamMemberRow, TeamRow, UserRow
from app.schemas import (
    AddTeamMemberRequest, AnalysisPreviewRequest, AnalysisReport, AuthResponse,
    AuthenticatedUser, CreateTeamRequest, LoginRequest, RegisterRequest, SyncRequest,
    SyncResponse,
)
from app.sync_service import SyncAuthorizationError, SyncNotFoundError, synchronize


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


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE, value=token, httponly=True, secure=settings.is_production,
        samesite="strict", max_age=settings.refresh_session_days * 24 * 60 * 60,
        path="/api/v1/auth",
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
    session.add_all([user, team, TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=user.id, role="ADMIN", created_at=now)])
    try:
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
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return response


@app.get("/api/v1/auth/me", response_model=AuthenticatedUser)
def me(user: UserRow = Depends(get_current_user), session: Session = Depends(get_session)) -> dict[str, object]:
    return user_payload(session, user)


@app.post("/api/v1/teams", response_model=AuthenticatedUser, status_code=status.HTTP_201_CREATED)
def create_team(payload: CreateTeamRequest, user: UserRow = Depends(get_current_user), session: Session = Depends(get_session)) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    team = TeamRow(id=str(uuid4()), name=payload.name.strip(), created_by_user_id=user.id, created_at=now)
    session.add_all([team, TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=user.id, role="ADMIN", created_at=now)])
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
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(status_code=503, detail="Persistência central indisponível.") from error
