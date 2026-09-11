"""cria a persistência central e o log de sincronização

Revision ID: 0001_central_sync
Revises:
Create Date: 2026-09-11 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_central_sync"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("tombstone", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_token_hash", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "inventory_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("inventory_id", sa.String(length=36), nullable=False),
        sa.Column("side", sa.String(length=2), nullable=False),
        sa.Column("bay", sa.String(length=100), nullable=False),
        sa.Column("lot", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("tombstone", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["inventory_id"], ["inventories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_entries_inventory_id", "inventory_entries", ["inventory_id"], unique=False)
    op.create_table(
        "sync_events",
        sa.Column("sequence", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("inventory_id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["inventory_id"], ["inventories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("sequence"),
    )
    op.create_index("ix_sync_events_inventory_id", "sync_events", ["inventory_id"], unique=False)
    op.create_table(
        "sync_conflicts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("inventory_id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", sa.String(length=16), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("device_id", sa.String(length=36), nullable=False),
        sa.Column("incoming_payload", sa.JSON(), nullable=False),
        sa.Column("server_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolution", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["inventory_id"], ["inventories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_conflicts_inventory_id", "sync_conflicts", ["inventory_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sync_conflicts_inventory_id", table_name="sync_conflicts")
    op.drop_table("sync_conflicts")
    op.drop_index("ix_sync_events_inventory_id", table_name="sync_events")
    op.drop_table("sync_events")
    op.drop_index("ix_inventory_entries_inventory_id", table_name="inventory_entries")
    op.drop_table("inventory_entries")
    op.drop_table("inventories")
