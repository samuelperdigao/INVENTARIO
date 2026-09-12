"""Cria identidades verificadas para o fluxo Playwright local."""

from datetime import datetime, timezone
from pathlib import Path
import sys
from uuid import uuid4

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy.orm import Session

from app.auth_service import hash_password, hash_recovery_pin
from app.config import get_settings
from app.database import engine
from app.persistence import TeamMemberRow, TeamRow, UserRow


def create_user(session: Session, email: str) -> UserRow:
    now = datetime.now(timezone.utc)
    user = UserRow(
        id=str(uuid4()), email=email, display_name=email.split("@")[0],
        password_hash=hash_password("senha-segura-123"),
        recovery_pin_hash=hash_recovery_pin("38427105", get_settings()),
        recovery_pin_failed_attempts=0, recovery_pin_locked_until=None,
        created_at=now, email_verified_at=now,
    )
    session.add(user)
    session.flush()
    return user


def main() -> None:
    owner_email, participant_email = sys.argv[1:3]
    with Session(engine) as session:
        owner = create_user(session, owner_email)
        create_user(session, participant_email)
        now = datetime.now(timezone.utc)
        team = TeamRow(id=str(uuid4()), name="Equipe E2E", created_by_user_id=owner.id, created_at=now)
        session.add(team)
        session.flush()
        session.add(TeamMemberRow(id=str(uuid4()), team_id=team.id, user_id=owner.id, role="ADMIN", created_at=now))
        session.commit()


if __name__ == "__main__":
    main()
