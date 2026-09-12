"""adiciona verificação, participação amigável e autoria do histórico

Revision ID: 0005_access_sharing
Revises: 0004_reports_finalization
Create Date: 2026-09-12 02:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_access_sharing"
down_revision = "0004_reports_finalization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_users_email_verified_at", ["email_verified_at"])
    # Contas anteriores à verificação já tinham sido autenticadas e são
    # preservadas como verificadas para evitar bloqueio retroativo.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")

    with op.batch_alter_table("inventories") as batch_op:
        batch_op.add_column(sa.Column("finalized_by_user_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("participation_code", sa.String(length=6), nullable=True))
        batch_op.create_foreign_key("fk_inventories_finalized_by_user_id", "users", ["finalized_by_user_id"], ["id"], ondelete="RESTRICT")
        batch_op.create_index("ix_inventories_finalized_by_user_id", ["finalized_by_user_id"])
        batch_op.create_index("ix_inventories_participation_code", ["participation_code"], unique=True)

    op.create_table(
        "auth_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')", name="ck_auth_codes_purpose"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_codes_user_id", "auth_codes", ["user_id"])
    op.create_index("ix_auth_codes_purpose", "auth_codes", ["purpose"])

    op.create_table(
        "inventory_participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("inventory_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["inventory_id"], ["inventories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("access_token_hash"),
        sa.UniqueConstraint("inventory_id", "user_id", name="uq_inventory_participants_inventory_user"),
    )
    op.create_index("ix_inventory_participants_inventory_id", "inventory_participants", ["inventory_id"])
    op.create_index("ix_inventory_participants_user_id", "inventory_participants", ["user_id"])

    op.create_table(
        "participation_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("successful", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_participation_attempts_user_id", "participation_attempts", ["user_id"])
    op.create_index("ix_participation_attempts_created_at", "participation_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_participation_attempts_created_at", table_name="participation_attempts")
    op.drop_index("ix_participation_attempts_user_id", table_name="participation_attempts")
    op.drop_table("participation_attempts")
    op.drop_index("ix_inventory_participants_user_id", table_name="inventory_participants")
    op.drop_index("ix_inventory_participants_inventory_id", table_name="inventory_participants")
    op.drop_table("inventory_participants")
    op.drop_index("ix_auth_codes_purpose", table_name="auth_codes")
    op.drop_index("ix_auth_codes_user_id", table_name="auth_codes")
    op.drop_table("auth_codes")
    with op.batch_alter_table("inventories") as batch_op:
        batch_op.drop_index("ix_inventories_participation_code")
        batch_op.drop_index("ix_inventories_finalized_by_user_id")
        batch_op.drop_constraint("fk_inventories_finalized_by_user_id", type_="foreignkey")
        batch_op.drop_column("participation_code")
        batch_op.drop_column("finalized_by_user_id")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email_verified_at")
        batch_op.drop_column("email_verified_at")
