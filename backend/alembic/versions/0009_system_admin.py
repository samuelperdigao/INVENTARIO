"""Administração global, ciclos operacionais, auditoria e versões oficiais.

Revision ID: 0009_system_admin
Revises: 0008_inventory_lot_references
"""

from datetime import datetime, timezone
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "0009_system_admin"
down_revision = "0008_inventory_lot_references"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventories", sa.Column("operational_generation", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("inventories", sa.Column("report_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("inventories", sa.Column("owner_access_hash", sa.String(64), nullable=True))
    op.add_column("inventory_entries", sa.Column("operational_generation", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "system_admins",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "admin_report_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("inventory_id", sa.String(36), sa.ForeignKey("inventories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("operational_generation", sa.Integer(), nullable=False),
        sa.Column("inventory_revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("inventory_id", "version", name="uq_admin_report_version"),
    )
    op.create_index("ix_admin_report_versions_inventory_id", "admin_report_versions", ["inventory_id"])
    op.create_table(
        "admin_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("inventory_id", sa.String(36), sa.ForeignKey("inventories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entry_id", sa.String(36)),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("reason", sa.String(1000)),
        sa.Column("before", sa.JSON()),
        sa.Column("after", sa.JSON()),
        sa.Column("inventory_revision", sa.Integer(), nullable=False),
        sa.Column("operational_generation", sa.Integer(), nullable=False),
        sa.Column("report_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_audit_inventory_id", "admin_audit", ["inventory_id"])

    # Relatórios já finalizados passam a ser a primeira versão imutável.
    connection = op.get_bind()
    inventories = sa.table(
        "inventories", sa.column("id", sa.String), sa.column("revision", sa.Integer),
        sa.column("finalized_at", sa.DateTime(timezone=True)), sa.column("report_snapshot", sa.JSON),
        sa.column("report_version", sa.Integer),
    )
    versions = sa.table(
        "admin_report_versions", sa.column("id", sa.String), sa.column("inventory_id", sa.String),
        sa.column("version", sa.Integer), sa.column("operational_generation", sa.Integer),
        sa.column("inventory_revision", sa.Integer), sa.column("snapshot", sa.JSON),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    for row in connection.execute(sa.select(inventories.c.id, inventories.c.revision, inventories.c.finalized_at, inventories.c.report_snapshot).where(inventories.c.report_snapshot.is_not(None))):
        connection.execute(sa.insert(versions).values(
            id=str(uuid4()), inventory_id=row.id, version=1, operational_generation=1,
            inventory_revision=row.revision, snapshot=row.report_snapshot,
            created_at=row.finalized_at or datetime.now(timezone.utc),
        ))
        connection.execute(sa.update(inventories).where(inventories.c.id == row.id).values(report_version=1))


def downgrade() -> None:
    op.drop_index("ix_admin_audit_inventory_id", table_name="admin_audit")
    op.drop_table("admin_audit")
    op.drop_index("ix_admin_report_versions_inventory_id", table_name="admin_report_versions")
    op.drop_table("admin_report_versions")
    op.drop_table("system_admins")
    op.drop_column("inventory_entries", "operational_generation")
    op.drop_column("inventories", "report_version")
    op.drop_column("inventories", "owner_access_hash")
    op.drop_column("inventories", "operational_generation")
