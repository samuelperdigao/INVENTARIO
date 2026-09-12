"""Identidade, sessão renovável e autorização de equipes."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.persistence import AuthCodeRow, SessionRow, TeamMemberRow, TeamRow, UserRow


CORPORATE_EMAIL_DOMAIN = "gerdau.com.br"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def is_allowed_corporate_email(email: str) -> bool:
    local_part, separator, domain = normalize_email(email).rpartition("@")
    return bool(local_part and separator and domain == CORPORATE_EMAIL_DOMAIN)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return f"scrypt$16384$8$1${_b64(salt)}${_b64(derived)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode("utf-8"), salt=_unb64(salt), n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(actual, _unb64(expected))
    except (ValueError, TypeError):
        return False


def _sign(payload: dict[str, Any], settings: Settings) -> str:
    header = _b64(b'{"alg":"HS256","typ":"JWT"}')
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _b64(hmac.new(settings.auth_secret.encode("utf-8"), f"{header}.{body}".encode("ascii"), hashlib.sha256).digest())
    return f"{header}.{body}.{signature}"


def create_access_token(user: UserRow, settings: Settings) -> str:
    now = _now()
    return _sign(
        {"sub": user.id, "iat": int(now.timestamp()), "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()), "typ": "access"},
        settings,
    )


def read_access_token(token: str, settings: Settings) -> str:
    try:
        header, body, signature = token.split(".")
        expected = _b64(hmac.new(settings.auth_secret.encode("utf-8"), f"{header}.{body}".encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(_unb64(body))
        if payload.get("typ") != "access" or not isinstance(payload.get("sub"), str) or int(payload["exp"]) <= int(_now().timestamp()):
            raise ValueError
        return payload["sub"]
    except (ValueError, KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.") from None


def create_refresh_session(session: Session, user: UserRow, settings: Settings) -> str:
    token = secrets.token_urlsafe(48)
    session.add(SessionRow(
        id=str(uuid4()), user_id=user.id, token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        created_at=_now(), expires_at=_now() + timedelta(days=settings.refresh_session_days), revoked_at=None,
    ))
    return token


def authenticate_refresh_session(session: Session, token: str) -> UserRow:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    record = session.scalar(select(SessionRow).where(SessionRow.token_hash == token_hash))
    expires_at = record.expires_at.replace(tzinfo=timezone.utc) if record and record.expires_at.tzinfo is None else (record.expires_at if record else None)
    if record is None or record.revoked_at is not None or expires_at is None or expires_at <= _now():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    user = session.get(UserRow, record.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    return user


def revoke_refresh_session(session: Session, token: str) -> None:
    record = session.scalar(select(SessionRow).where(SessionRow.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()))
    if record and record.revoked_at is None:
        record.revoked_at = _now()
        session.commit()


def revoke_all_refresh_sessions(session: Session, user_id: str) -> None:
    now = _now()
    records = session.scalars(
        select(SessionRow).where(SessionRow.user_id == user_id, SessionRow.revoked_at.is_(None))
    ).all()
    for record in records:
        record.revoked_at = now


def create_auth_code(
    session: Session,
    user: UserRow,
    settings: Settings,
    *,
    purpose: str,
    validity_minutes: int,
) -> str:
    now = _now()
    latest = session.scalar(
        select(AuthCodeRow)
        .where(AuthCodeRow.user_id == user.id, AuthCodeRow.purpose == purpose)
        .order_by(AuthCodeRow.created_at.desc())
    )
    latest_created_at = latest.created_at.replace(tzinfo=timezone.utc) if latest and latest.created_at.tzinfo is None else (latest.created_at if latest else None)
    if latest_created_at and latest_created_at > now - timedelta(seconds=60):
        raise HTTPException(status_code=429, detail="Aguarde um minuto antes de solicitar outro código.")
    active_codes = session.scalars(
        select(AuthCodeRow).where(
            AuthCodeRow.user_id == user.id,
            AuthCodeRow.purpose == purpose,
            AuthCodeRow.consumed_at.is_(None),
        )
    ).all()
    for active in active_codes:
        active.consumed_at = now
    code = f"{secrets.randbelow(1_000_000):06d}"
    digest = hmac.new(
        settings.auth_secret.encode("utf-8"),
        f"{user.id}:{purpose}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    session.add(AuthCodeRow(
        id=str(uuid4()),
        user_id=user.id,
        purpose=purpose,
        code_hash=digest,
        created_at=now,
        expires_at=now + timedelta(minutes=validity_minutes),
        attempts=0,
        max_attempts=settings.auth_code_max_attempts,
        consumed_at=None,
    ))
    return code


def consume_auth_code(
    session: Session,
    user: UserRow,
    settings: Settings,
    *,
    purpose: str,
    code: str,
) -> None:
    record = session.scalar(
        select(AuthCodeRow)
        .where(
            AuthCodeRow.user_id == user.id,
            AuthCodeRow.purpose == purpose,
            AuthCodeRow.consumed_at.is_(None),
        )
        .order_by(AuthCodeRow.created_at.desc())
    )
    now = _now()
    expires_at = record.expires_at.replace(tzinfo=timezone.utc) if record and record.expires_at.tzinfo is None else (record.expires_at if record else None)
    if record is None or expires_at is None or expires_at <= now or record.attempts >= record.max_attempts:
        raise HTTPException(status_code=422, detail="Código inválido, expirado ou bloqueado.")
    digest = hmac.new(
        settings.auth_secret.encode("utf-8"),
        f"{user.id}:{purpose}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(record.code_hash, digest):
        record.attempts += 1
        session.commit()
        raise HTTPException(status_code=422, detail="Código inválido, expirado ou bloqueado.")
    record.consumed_at = now


def membership_for(session: Session, user_id: str, team_id: str) -> TeamMemberRow | None:
    return session.scalar(select(TeamMemberRow).where(TeamMemberRow.user_id == user_id, TeamMemberRow.team_id == team_id))


def require_team_member(session: Session, user_id: str, team_id: str) -> TeamMemberRow:
    membership = membership_for(session, user_id, team_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventário não encontrado.")
    return membership


def require_team_admin(session: Session, user_id: str, team_id: str) -> TeamMemberRow:
    membership = require_team_member(session, user_id, team_id)
    if membership.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta ação exige o papel de responsável.")
    return membership


def user_payload(session: Session, user: UserRow) -> dict[str, Any]:
    memberships = session.execute(
        select(TeamMemberRow, TeamRow).join(TeamRow, TeamRow.id == TeamMemberRow.team_id).where(TeamMemberRow.user_id == user.id)
    ).all()
    return {
        "id": user.id, "email": user.email, "displayName": user.display_name,
        "emailVerified": user.email_verified_at is not None,
        "teams": [{"id": team.id, "name": team.name, "role": member.role} for member, team in memberships],
    }
