import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import get_session
from app.email_service import development_outbox
from app.main import app
from app.persistence import UserRow
from auth_helpers import register_verified


client = TestClient(app)


def _times() -> dict[str, str]:
    value = datetime.now(timezone.utc).isoformat()
    return {"createdAt": value, "updatedAt": value}


def _inventory(inventory_id: str) -> dict[str, object]:
    return {
        "id": inventory_id, "date": "2026-09-12", "status": "OPEN",
        "revision": 1, "syncBaseRevision": 0, "tombstone": False,
        "deletedAt": None, **_times(),
    }


def _entry(inventory_id: str) -> dict[str, object]:
    return {
        "id": str(uuid4()), "inventoryId": inventory_id, "side": "DE", "bay": "15",
        "lot": "2815634434", "quantity": 19, "revision": 1,
        "syncBaseRevision": 0, "tombstone": False, "deletedAt": None, **_times(),
    }


def _registration(email: str, pin: str = "38427105") -> dict[str, str]:
    return {
        "email": email, "password": "senha-segura-123",
        "passwordConfirmation": "senha-segura-123", "displayName": "Novo Usuário",
        "recoveryPin": pin, "recoveryPinConfirmation": pin,
    }


def test_registration_accepts_any_valid_email_and_enters_without_creating_team() -> None:
    rejected = client.post("/api/v1/auth/register", json={
        **_registration("email-invalido"), "displayName": "Inválido",
    })
    assert rejected.status_code == 422

    mismatched_np = client.post("/api/v1/auth/register", json={
        **_registration("np-divergente@example.com"), "recoveryPinConfirmation": "10572843",
    })
    assert mismatched_np.status_code == 422

    email = "novo.usuario@gmail.com"
    registered = client.post("/api/v1/auth/register", json=_registration(email))
    assert registered.status_code == 201
    assert registered.json()["user"]["recoveryPinConfigured"] is True
    assert registered.json()["user"]["teams"] == []
    assert "38427105" not in registered.text
    assert "recovery_pin_hash" not in registered.text
    assert development_outbox == []
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "senha-segura-123"}).status_code == 200


def test_recovery_pin_requires_eight_digits_and_locks_after_five_failures() -> None:
    email = "tentativas.pin@gerdau.com.br"
    assert client.post("/api/v1/auth/register", json=_registration(email)).status_code == 201
    malformed = client.post("/api/v1/auth/password-reset/confirm", json={
        "email": email, "recoveryPin": "1234567", "newPassword": "senha-nova-segura-456",
        "passwordConfirmation": "senha-nova-segura-456",
    })
    assert malformed.status_code == 422
    for _ in range(5):
        invalid = client.post("/api/v1/auth/password-reset/confirm", json={
            "email": email, "recoveryPin": "00000000", "newPassword": "senha-nova-segura-456",
            "passwordConfirmation": "senha-nova-segura-456",
        })
        assert invalid.status_code == 422
    blocked = client.post("/api/v1/auth/password-reset/confirm", json={
        "email": email, "recoveryPin": "38427105", "newPassword": "senha-nova-segura-456",
        "passwordConfirmation": "senha-nova-segura-456",
    })
    assert blocked.status_code == 429


def test_password_reset_changes_hash_and_revokes_previous_sessions() -> None:
    email = "recuperacao@gerdau.com.br"
    account, auth = register_verified(client, email)
    old_refresh = client.cookies.get("inventory_refresh")
    assert old_refresh

    changed = client.post("/api/v1/auth/password-reset/confirm", json={
        "email": email, "recoveryPin": "38427105", "newPassword": "senha-nova-segura-456",
        "passwordConfirmation": "senha-nova-segura-456",
    })
    assert changed.status_code == 200
    client.cookies.set("inventory_refresh", old_refresh)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "senha-segura-123"}).status_code == 401
    logged_in = client.post("/api/v1/auth/login", json={"email": email, "password": "senha-nova-segura-456"})
    assert logged_in.status_code == 200
    assert logged_in.json()["user"]["id"] == account["user"]["id"]
    assert auth["Authorization"].startswith("Bearer ")


def test_existing_account_configures_recovery_np_after_login() -> None:
    email = "conta-anterior@gerdau.com.br"
    account, _ = register_verified(client, email)
    dependency = app.dependency_overrides[get_session]()
    session = next(dependency)
    try:
        user = session.scalar(select(UserRow).where(UserRow.email == email))
        assert user is not None
        user.recovery_pin_hash = None
        session.commit()
    finally:
        dependency.close()

    logged_in = client.post("/api/v1/auth/login", json={
        "email": email, "password": "senha-segura-123",
    })
    assert logged_in.status_code == 200
    assert logged_in.json()["user"]["recoveryPinConfigured"] is False
    configured = client.post("/api/v1/auth/recovery-pin", json={
        "recoveryPin": "10572843", "recoveryPinConfirmation": "10572843",
    }, headers={"Authorization": f"Bearer {logged_in.json()['accessToken']}"})
    assert configured.status_code == 200
    assert configured.json()["id"] == account["user"]["id"]
    assert configured.json()["recoveryPinConfigured"] is True


def test_participation_code_hides_internal_access_and_finished_history_needs_no_token() -> None:
    owner, owner_auth = register_verified(client, "criador@gerdau.com.br", "Laminação")
    team_id = owner["user"]["teams"][0]["id"]
    inventory_id, token = str(uuid4()), str(uuid4())
    sync_headers = {**owner_auth, "X-Inventory-Sync-Token": token}
    created = client.post("/api/v1/sync", json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id,
        "cursor": 0, "inventory": _inventory(inventory_id), "entries": [_entry(inventory_id)],
    }, headers=sync_headers)
    assert created.status_code == 200
    participation_code = created.json()["participationCode"]
    assert re.fullmatch(r"\d{6}", participation_code)
    assert participation_code != token

    participant, participant_auth = register_verified(client, "participante@gerdau.com.br")
    joined = client.post("/api/v1/inventories/join", json={"code": participation_code}, headers=participant_auth)
    assert joined.status_code == 200
    assert joined.json()["inventoryId"] == inventory_id
    assert len(joined.json()["accessToken"]) >= 32
    pulled = client.post("/api/v1/sync", json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": None,
        "cursor": 0, "inventory": None, "entries": [],
    }, headers={**participant_auth, "X-Inventory-Sync-Token": joined.json()["accessToken"]})
    assert pulled.status_code == 200
    assert pulled.json()["entries"][0]["lot"] == "2815634434"

    finished = client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 1}, headers=sync_headers)
    assert finished.status_code == 200
    assert finished.json()["finalizedByUserId"] == owner["user"]["id"]
    history = client.get("/api/v1/inventories/history?scope=mine", headers=participant_auth)
    assert history.status_code == 200
    assert history.json()[0]["id"] == inventory_id
    assert client.get(f"/api/v1/inventories/{inventory_id}/exports/pdf", headers=participant_auth).status_code == 200
    assert client.post("/api/v1/inventories/join", json={"code": participation_code}, headers=participant_auth).status_code == 404


def test_participation_attempts_are_temporarily_limited() -> None:
    _, auth = register_verified(client, "limite.participacao@gerdau.com.br")
    for number in range(10):
        response = client.post("/api/v1/inventories/join", json={"code": f"{number:06d}"}, headers=auth)
        assert response.status_code == 404
    blocked = client.post("/api/v1/inventories/join", json={"code": "999999"}, headers=auth)
    assert blocked.status_code == 429


def test_report_email_uses_authenticated_recipient_and_selected_formats() -> None:
    owner, auth = register_verified(client, "relatorio@gerdau.com.br", "Equipe")
    team_id = owner["user"]["teams"][0]["id"]
    inventory_id, token = str(uuid4()), str(uuid4())
    headers = {**auth, "X-Inventory-Sync-Token": token}
    client.post("/api/v1/sync", json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id,
        "cursor": 0, "inventory": _inventory(inventory_id), "entries": [_entry(inventory_id)],
    }, headers=headers)
    assert client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 1}, headers=headers).status_code == 200
    sent = client.post(f"/api/v1/inventories/{inventory_id}/email", json={"formats": ["pdf", "xlsx"]}, headers=auth)
    assert sent.status_code == 200
    delivered = development_outbox[-1]
    assert delivered.recipient == "relatorio@gerdau.com.br"
    assert delivered.attachment_names == ("Inventario_12-09-2026.pdf", "Inventario_12-09-2026.xlsx")
