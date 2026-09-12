"""Links temporários assinados para compartilhar exportações sem expor sessão."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac

from app.config import Settings


SHARE_LINK_TTL = timedelta(hours=24)
SHAREABLE_FORMATS = frozenset({"xlsx", "docx"})


def create_export_share_signature(
    settings: Settings,
    *,
    inventory_id: str,
    format_name: str,
) -> tuple[int, str]:
    if format_name not in SHAREABLE_FORMATS:
        raise ValueError("Formato não permitido para link temporário.")
    expires_at = datetime.now(timezone.utc) + SHARE_LINK_TTL
    expires = int(expires_at.timestamp())
    payload = f"export-share:{inventory_id}:{format_name}:{expires}"
    signature = hmac.new(
        settings.auth_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return expires, signature


def validate_export_share_signature(
    settings: Settings,
    *,
    inventory_id: str,
    format_name: str,
    expires: int,
    signature: str,
) -> bool:
    if format_name not in SHAREABLE_FORMATS:
        return False
    now = int(datetime.now(timezone.utc).timestamp())
    if expires <= now:
        return False
    # Evita links absurdamente longos caso alguém tente alterar o timestamp.
    if expires > now + int(SHARE_LINK_TTL.total_seconds()) + 60:
        return False
    payload = f"export-share:{inventory_id}:{format_name}:{expires}"
    expected = hmac.new(
        settings.auth_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
