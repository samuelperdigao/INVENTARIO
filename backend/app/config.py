"""Configurações seguras da API, sempre derivadas do ambiente."""

from __future__ import annotations

import os
from dataclasses import dataclass


LOCAL_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    cors_origins: tuple[str, ...]
    auth_secret: str
    access_token_minutes: int
    refresh_session_days: int
    email_mode: str
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from_email: str | None
    smtp_security: str
    smtp2go_api_key: str | None
    recovery_pin_max_attempts: int
    recovery_pin_lock_minutes: int
    email_attachment_max_mb: int
    reference_max_mb: int
    reference_max_rows: int

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


def _origins() -> tuple[str, ...]:
    raw = os.getenv("INVENTORY_CORS_ORIGINS")
    if not raw:
        return LOCAL_ORIGINS
    return tuple(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())


def get_settings() -> Settings:
    environment = os.getenv("INVENTORY_ENV", "development").lower()
    database_url = os.getenv("INVENTORY_DATABASE_URL", "sqlite:///./backend/inventario.db")
    secret = os.getenv("INVENTORY_AUTH_SECRET", "development-only-change-before-production")
    settings = Settings(
        environment=environment,
        database_url=database_url,
        cors_origins=_origins(),
        auth_secret=secret,
        access_token_minutes=int(os.getenv("INVENTORY_ACCESS_TOKEN_MINUTES", "15")),
        refresh_session_days=int(os.getenv("INVENTORY_REFRESH_SESSION_DAYS", "14")),
        email_mode=os.getenv("INVENTORY_EMAIL_MODE", "console").lower(),
        smtp_host=os.getenv("INVENTORY_SMTP_HOST"),
        smtp_port=int(os.getenv("INVENTORY_SMTP_PORT", "587")),
        smtp_username=os.getenv("INVENTORY_SMTP_USERNAME"),
        smtp_password=os.getenv("INVENTORY_SMTP_PASSWORD"),
        smtp_from_email=os.getenv("INVENTORY_SMTP_FROM_EMAIL"),
        smtp_security=os.getenv("INVENTORY_SMTP_SECURITY", "starttls").lower(),
        smtp2go_api_key=os.getenv("INVENTORY_SMTP2GO_API_KEY"),
        recovery_pin_max_attempts=int(os.getenv("INVENTORY_RECOVERY_PIN_MAX_ATTEMPTS", "5")),
        recovery_pin_lock_minutes=int(os.getenv("INVENTORY_RECOVERY_PIN_LOCK_MINUTES", "15")),
        email_attachment_max_mb=int(os.getenv("INVENTORY_EMAIL_ATTACHMENT_MAX_MB", "15")),
        reference_max_mb=int(os.getenv("INVENTORY_REFERENCE_MAX_MB", "15")),
        reference_max_rows=int(os.getenv("INVENTORY_REFERENCE_MAX_ROWS", "250000")),
    )
    if settings.is_production:
        if not database_url.startswith("postgresql+"):
            raise RuntimeError("INVENTORY_DATABASE_URL deve apontar para PostgreSQL em produção.")
        if len(secret) < 32 or secret == "development-only-change-before-production":
            raise RuntimeError("INVENTORY_AUTH_SECRET forte é obrigatório em produção.")
        if not settings.cors_origins or any(origin == "*" or not origin.startswith("https://") for origin in settings.cors_origins):
            raise RuntimeError("INVENTORY_CORS_ORIGINS deve listar somente origens HTTPS explícitas em produção.")
        if settings.email_mode == "smtp":
            if not settings.smtp_host or not settings.smtp_from_email:
                raise RuntimeError("Servidor SMTP e remetente são obrigatórios em produção.")
            if settings.smtp_security not in {"starttls", "ssl"}:
                raise RuntimeError("INVENTORY_SMTP_SECURITY deve proteger o transporte em produção.")
        elif settings.email_mode == "smtp2go":
            if not settings.smtp2go_api_key or not settings.smtp_from_email:
                raise RuntimeError("SMTP2GO API key e remetente são obrigatórios em produção.")
        else:
            raise RuntimeError("INVENTORY_EMAIL_MODE deve ser smtp ou smtp2go em produção.")
    if settings.email_mode not in {"console", "smtp", "smtp2go"}:
        raise RuntimeError("INVENTORY_EMAIL_MODE deve ser console, smtp ou smtp2go.")
    if settings.smtp_security not in {"starttls", "ssl", "none"}:
        raise RuntimeError("INVENTORY_SMTP_SECURITY deve ser starttls, ssl ou none.")
    return settings
