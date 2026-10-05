"""Permite mais de uma sessão de participante por conta e inventário.

Revision ID: 0010_participant_sync_sessions
Revises: 0009_system_admin
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_participant_sync_sessions"
down_revision = "0009_system_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_participant_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("inventory_id", sa.String(36), sa.ForeignKey("inventories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("access_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("inventory_id", "user_id", "access_token_hash", name="uq_inventory_participant_sessions_scope_token"),
    )
    op.create_index("ix_inventory_participant_sessions_inventory_id", "inventory_participant_sessions", ["inventory_id"])
    op.create_index("ix_inventory_participant_sessions_user_id", "inventory_participant_sessions", ["user_id"])
    op.create_index(
        "ix_inventory_participant_sessions_inventory_user",
        "inventory_participant_sessions",
        ["inventory_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_participant_sessions_inventory_user", table_name="inventory_participant_sessions")
    op.drop_index("ix_inventory_participant_sessions_user_id", table_name="inventory_participant_sessions")
    op.drop_index("ix_inventory_participant_sessions_inventory_id", table_name="inventory_participant_sessions")
    op.drop_table("inventory_participant_sessions")
