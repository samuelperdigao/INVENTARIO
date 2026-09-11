"""restringe papéis persistidos de membros de equipe

Revision ID: 0003_team_member_role_constraint
Revises: 0002_auth_teams_access
Create Date: 2026-09-11 17:00:00
"""

from alembic import op


revision = "0003_team_member_role_constraint"
down_revision = "0002_auth_teams_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("team_members") as batch_op:
        batch_op.create_check_constraint("ck_team_members_role", "role IN ('ADMIN', 'OPERATOR')")


def downgrade() -> None:
    with op.batch_alter_table("team_members") as batch_op:
        batch_op.drop_constraint("ck_team_members_role", type_="check")
