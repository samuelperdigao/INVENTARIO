"""Tabelas centrais da Fase 2, independentes do contrato HTTP."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryRow(Base):
    __tablename__ = "inventories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    tombstone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class InventoryEntryRow(Base):
    __tablename__ = "inventory_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    side: Mapped[str] = mapped_column(String(2), nullable=False)
    bay: Mapped[str] = mapped_column(String(100), nullable=False)
    lot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    tombstone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SyncEventRow(Base):
    __tablename__ = "sync_events"

    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)


class SyncConflictRow(Base):
    __tablename__ = "sync_conflicts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), nullable=False)
    incoming_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    server_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolution: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
