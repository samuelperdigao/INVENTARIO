"""adiciona identidade, equipes e proteção de inventários

Revision ID: 0002_auth_teams_access
Revises: 0001_central_sync
Create Date: 2026-09-11 16:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_auth_teams_access"
down_revision = "0001_central_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("email"),
    )
    op.create_table(
        "teams",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "team_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
    )
    op.create_index("ix_team_members_team_id", "team_members", ["team_id"])
    op.create_index("ix_team_members_user_id", "team_members", ["user_id"])
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    with op.batch_alter_table("inventories") as batch_op:
        batch_op.add_column(sa.Column("team_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("owner_user_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key("fk_inventories_team_id", "teams", ["team_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("fk_inventories_owner_user_id", "users", ["owner_user_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_index("ix_inventories_team_id", ["team_id"])
        batch_op.create_index("ix_inventories_owner_user_id", ["owner_user_id"])


def downgrade() -> None:
    with op.batch_alter_table("inventories") as batch_op:
        batch_op.drop_index("ix_inventories_owner_user_id")
        batch_op.drop_index("ix_inventories_team_id")
        batch_op.drop_constraint("fk_inventories_owner_user_id", type_="foreignkey")
        batch_op.drop_constraint("fk_inventories_team_id", type_="foreignkey")
        batch_op.drop_column("owner_user_id")
        batch_op.drop_column("team_id")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index("ix_team_members_user_id", table_name="team_members")
    op.drop_index("ix_team_members_team_id", table_name="team_members")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("users")
