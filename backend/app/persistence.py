"""Tabelas centrais da Fase 2, independentes do contrato HTTP."""

from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class InventoryRow(Base):
    __tablename__ = "inventories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    date: Mapped[DateType] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    tombstone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), index=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    owner_access_hash: Mapped[str | None] = mapped_column(String(64))
    finalized_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    participation_code: Mapped[str | None] = mapped_column(String(6), unique=True, index=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    report_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    operational_generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    report_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    recovery_pin_hash: Mapped[str | None] = mapped_column(String(255))
    recovery_pin_failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recovery_pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class SystemAdminRow(Base):
    __tablename__ = "system_admins"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TeamRow(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TeamMemberRow(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
        CheckConstraint("role IN ('ADMIN', 'OPERATOR')", name="ck_team_members_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SessionRow(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class InventoryParticipantRow(Base):
    __tablename__ = "inventory_participants"
    __table_args__ = (
        UniqueConstraint("inventory_id", "user_id", name="uq_inventory_participants_inventory_user"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ParticipationAttemptRow(Base):
    __tablename__ = "participation_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    successful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


class InventoryEntryRow(Base):
    __tablename__ = "inventory_entries"
    __table_args__ = (
        CheckConstraint(
            "layer IS NULL OR layer IN ('A1','A2','A3','A4','A5','A6','A7','A8','A9','A10')",
            name="ck_inventory_entries_layer",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    side: Mapped[str] = mapped_column(String(2), nullable=False)
    bay: Mapped[str] = mapped_column(String(100), nullable=False)
    layer: Mapped[str | None] = mapped_column(String(3), index=True)
    lot: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    duplicate_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    tombstone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    operational_generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AdminReportVersionRow(Base):
    __tablename__ = "admin_report_versions"
    __table_args__ = (UniqueConstraint("inventory_id", "version", name="uq_admin_report_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    operational_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    inventory_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AdminAuditRow(Base):
    __tablename__ = "admin_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    entry_id: Mapped[str | None] = mapped_column(String(36))
    actor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    action: Mapped[str] = mapped_column(String(48), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(1000))
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    inventory_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    operational_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    report_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class InventoryReferenceRow(Base):
    """A referência ativa de lotes associada a um inventário.

    O arquivo original nunca é persistido. Esta tabela guarda apenas os
    metadados operacionais e a tabela filha guarda exclusivamente os números
    de lote normalizados.
    """

    __tablename__ = "inventory_references"
    __table_args__ = (
        UniqueConstraint("inventory_id", name="uq_inventory_references_inventory"),
        CheckConstraint("status IN ('ACTIVE', 'REMOVED')", name="ck_inventory_references_status"),
        CheckConstraint("source_type IN ('SAP_EXCEL')", name="ck_inventory_references_source_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inventory_id: Mapped[str] = mapped_column(ForeignKey("inventories.id", ondelete="RESTRICT"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    total_lots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ReferenceLotRow(Base):
    """Um único número de lote da referência, sem dados adicionais da planilha."""

    __tablename__ = "reference_lots"
    __table_args__ = (
        UniqueConstraint("reference_id", "lot_number", name="uq_reference_lots_reference_lot"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reference_id: Mapped[str] = mapped_column(ForeignKey("inventory_references.id", ondelete="CASCADE"), index=True, nullable=False)
    lot_number: Mapped[str] = mapped_column(String(255), index=True, nullable=False)


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
