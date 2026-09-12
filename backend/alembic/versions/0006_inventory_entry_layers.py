"""adiciona camada, autoria e confirmação de lote repetido aos lançamentos

Revision ID: 0006_entry_layers
Revises: 0005_access_sharing
Create Date: 2026-09-12 05:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_entry_layers"
down_revision = "0005_access_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("inventory_entries") as batch_op:
        batch_op.add_column(sa.Column("layer", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("created_by_user_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("duplicate_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.create_foreign_key(
            "fk_inventory_entries_created_by_user_id",
            "users",
            ["created_by_user_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_check_constraint(
            "ck_inventory_entries_layer",
            "layer IS NULL OR layer IN ('A1','A2','A3','A4','A5','A6','A7','A8','A9','A10')",
        )
        batch_op.create_index("ix_inventory_entries_layer", ["layer"])
        batch_op.create_index("ix_inventory_entries_created_by_user_id", ["created_by_user_id"])
        batch_op.alter_column("duplicate_confirmed", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("inventory_entries") as batch_op:
        batch_op.drop_index("ix_inventory_entries_created_by_user_id")
        batch_op.drop_index("ix_inventory_entries_layer")
        batch_op.drop_constraint("ck_inventory_entries_layer", type_="check")
        batch_op.drop_constraint("fk_inventory_entries_created_by_user_id", type_="foreignkey")
        batch_op.drop_column("duplicate_confirmed")
        batch_op.drop_column("created_by_user_id")
        batch_op.drop_column("layer")
