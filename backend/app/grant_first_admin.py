"""Atribui a primeira permissão global a uma conta já cadastrada.

Uso em terminal confiável, com INVENTORY_DATABASE_URL configurada:
    python -m app.grant_first_admin --email conta@exemplo.com

Não recebe senha e exige digitação interativa do endereço confirmado.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import sys

from sqlalchemy import func, select, text

from app.auth_service import normalize_email
from app.database import SessionLocal
from app.persistence import SystemAdminRow, UserRow


def main() -> int:
    parser = argparse.ArgumentParser(description="Conceder a primeira permissão administrativa global.")
    parser.add_argument("--email", required=True, help="E-mail de uma conta existente e verificada.")
    args = parser.parse_args()
    email = normalize_email(args.email)
    with SessionLocal() as session:
        if session.bind and session.bind.dialect.name == "postgresql":
            session.execute(text("SELECT pg_advisory_xact_lock(264992313)"))
        existing = int(session.scalar(select(func.count()).select_from(SystemAdminRow)) or 0)
        if existing:
            print("Já existe uma conta administrativa. Nenhuma alteração realizada.", file=sys.stderr)
            return 2
        user = session.scalar(select(UserRow).where(UserRow.email == email))
        if user is None or user.email_verified_at is None:
            print("Conta cadastrada e verificada não encontrada.", file=sys.stderr)
            return 2
        typed = input(f"Confirme a atribuição à conta {user.display_name}. Digite o e-mail completo: ").strip()
        if normalize_email(typed) != user.email:
            print("Confirmação divergente. Nenhuma alteração realizada.", file=sys.stderr)
            return 2
        session.add(SystemAdminRow(user_id=user.id, granted_at=datetime.now(timezone.utc)))
        session.commit()
    print("Permissão global concedida. A conta deve atualizar a sessão para abrir /admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
