"""Infraestrutura SQLAlchemy do armazenamento central.

SQLite atende somente o desenvolvimento local e testes. Em produção, configure
``INVENTORY_DATABASE_URL`` com uma URL ``postgresql+psycopg://`` e execute
as migrações Alembic antes de iniciar a API.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


def database_url() -> str:
    return get_settings().database_url


def create_database_engine(url: str | None = None):
    resolved_url = url or database_url()
    connect_args = {"check_same_thread": False} if resolved_url.startswith("sqlite") else {}
    return create_engine(resolved_url, future=True, pool_pre_ping=not resolved_url.startswith("sqlite"), connect_args=connect_args)


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
