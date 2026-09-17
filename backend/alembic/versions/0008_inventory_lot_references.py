"""adiciona referências opcionais de lotes importadas do Excel do SAP

Revision ID: 0008_inventory_lot_references
Revises: 0007_recovery_pin
Create Date: 2026-09-16 12:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_inventory_lot_references"
down_revision = "0007_recovery_pin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("inventory_id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("total_lots", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.CheckConstraint("status IN ('ACTIVE', 'REMOVED')", name="ck_inventory_references_status"),
        sa.CheckConstraint("source_type IN ('SAP_EXCEL')", name="ck_inventory_references_source_type"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["inventory_id"], ["inventories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("inventory_id", name="uq_inventory_references_inventory"),
    )
    op.create_index("ix_inventory_references_inventory_id", "inventory_references", ["inventory_id"])
    op.create_index("ix_inventory_references_created_by_user_id", "inventory_references", ["created_by_user_id"])

    op.create_table(
        "reference_lots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("reference_id", sa.String(length=36), nullable=False),
        sa.Column("lot_number", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["reference_id"], ["inventory_references.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference_id", "lot_number", name="uq_reference_lots_reference_lot"),
    )
    op.create_index("ix_reference_lots_reference_id", "reference_lots", ["reference_id"])
    op.create_index("ix_reference_lots_lot_number", "reference_lots", ["lot_number"])


def downgrade() -> None:
    op.drop_index("ix_reference_lots_lot_number", table_name="reference_lots")
    op.drop_index("ix_reference_lots_reference_id", table_name="reference_lots")
    op.drop_table("reference_lots")
    op.drop_index("ix_inventory_references_created_by_user_id", table_name="inventory_references")
    op.drop_index("ix_inventory_references_inventory_id", table_name="inventory_references")
    op.drop_table("inventory_references")
