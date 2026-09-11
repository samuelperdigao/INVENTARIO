"""adiciona relatório consolidado e finalização de inventário

Revision ID: 0004_inventory_reports_finalization
Revises: 0003_team_member_role_constraint
Create Date: 2026-09-11 20:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_inventory_reports_finalization"
down_revision = "0003_team_member_role_constraint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("inventories") as batch_op:
        batch_op.add_column(sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("report_snapshot", sa.JSON(), nullable=True))
        batch_op.create_index("ix_inventories_finalized_at", ["finalized_at"])


def downgrade() -> None:
    with op.batch_alter_table("inventories") as batch_op:
        batch_op.drop_index("ix_inventories_finalized_at")
        batch_op.drop_column("report_snapshot")
        batch_op.drop_column("finalized_at")
