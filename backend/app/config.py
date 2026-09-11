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
    )
    if settings.is_production:
        if not database_url.startswith("postgresql+"):
            raise RuntimeError("INVENTORY_DATABASE_URL deve apontar para PostgreSQL em produção.")
        if len(secret) < 32 or secret == "development-only-change-before-production":
            raise RuntimeError("INVENTORY_AUTH_SECRET forte é obrigatório em produção.")
        if not settings.cors_origins or any(origin == "*" or not origin.startswith("https://") for origin in settings.cors_origins):
            raise RuntimeError("INVENTORY_CORS_ORIGINS deve listar somente origens HTTPS explícitas em produção.")
    return settings
