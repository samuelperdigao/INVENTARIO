"""adiciona NP pessoal para recuperação sem e-mail

Revision ID: 0007_recovery_pin
Revises: 0006_entry_layers
Create Date: 2026-09-12 06:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_recovery_pin"
down_revision = "0006_entry_layers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("recovery_pin_hash", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("recovery_pin_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("recovery_pin_locked_until", sa.DateTime(timezone=True), nullable=True))
    # A confirmação de e-mail deixou de ser requisito. A coluna permanece por
    # compatibilidade com versões anteriores do contrato e pode ser removida depois.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")
    op.drop_index("ix_auth_codes_purpose", table_name="auth_codes")
    op.drop_index("ix_auth_codes_user_id", table_name="auth_codes")
    op.drop_table("auth_codes")


def downgrade() -> None:
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
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("recovery_pin_locked_until")
        batch_op.drop_column("recovery_pin_failed_attempts")
        batch_op.drop_column("recovery_pin_hash")
