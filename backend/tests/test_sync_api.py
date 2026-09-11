from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def record_times() -> dict[str, str]:
    now = datetime.now(timezone.utc).isoformat()
    return {"createdAt": now, "updatedAt": now}


def inventory(inventory_id: str, revision: int = 1, base_revision: int = 0) -> dict[str, object]:
    return {"id": inventory_id, "date": "2026-09-11", "status": "OPEN", "revision": revision, "syncBaseRevision": base_revision, "tombstone": False, "deletedAt": None, **record_times()}


def entry(inventory_id: str, entry_id: str, lot: str, revision: int = 1, base_revision: int = 0, tombstone: bool = False) -> dict[str, object]:
    return {"id": entry_id, "inventoryId": inventory_id, "side": "EF", "bay": "01", "lot": lot, "quantity": 3, "revision": revision, "syncBaseRevision": base_revision, "tombstone": tombstone, "deletedAt": datetime.now(timezone.utc).isoformat() if tombstone else None, **record_times()}


def register(email: str, team: str) -> tuple[dict[str, object], dict[str, str]]:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "senha-segura-123", "displayName": email.split("@")[0], "teamName": team})
    assert response.status_code == 201
    body = response.json()
    return body, {"Authorization": f"Bearer {body['accessToken']}"}


def sync_payload(inventory_id: str, team_id: str, *, inventory_record: dict[str, object] | None, entries: list[dict[str, object]], cursor: int = 0) -> dict[str, object]:
    return {"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": cursor, "inventory": inventory_record, "entries": entries}


def sync_headers(auth: dict[str, str], token: str) -> dict[str, str]:
    return {**auth, "X-Inventory-Sync-Token": token}


def test_authentication_is_required_and_refreshes_with_httponly_session() -> None:
    inventory_id = str(uuid4())
    denied = client.post("/api/v1/sync", json=sync_payload(inventory_id, str(uuid4()), inventory_record=None, entries=[]), headers={"X-Inventory-Sync-Token": str(uuid4())})
    assert denied.status_code == 401

    registered = client.post("/api/v1/auth/register", json={"email": "owner@example.com", "password": "senha-segura-123", "displayName": "owner", "teamName": "Equipe principal"})
    assert registered.status_code == 201
    assert "httponly" in registered.headers["set-cookie"].lower()
    account = registered.json()
    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["user"]["id"] == account["user"]["id"]


def test_cors_allows_only_explicit_local_origin_with_credentials() -> None:
    response = client.options("/api/v1/sync", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_sync_is_idempotent_and_returns_incremental_changes_for_authorized_team() -> None:
    account, auth = register("owner@example.com", "Equipe principal")
    team_id = account["user"]["teams"][0]["id"]
    inventory_id, entry_id, token = str(uuid4()), str(uuid4()), str(uuid4())
    payload = sync_payload(inventory_id, team_id, inventory_record=inventory(inventory_id), entries=[entry(inventory_id, entry_id, "000123")])

    first = client.post("/api/v1/sync", json=payload, headers=sync_headers(auth, token))
    assert first.status_code == 200
    body = first.json()
    assert body["acknowledged"] == {"inventory": True, "entryIds": [entry_id]}
    assert len(body["entries"]) == 1
    cursor = body["cursor"]

    replay = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=inventory(inventory_id), entries=[entry(inventory_id, entry_id, "000123")], cursor=cursor), headers=sync_headers(auth, token))
    assert replay.status_code == 200
    assert replay.json()["entries"] == []

    pull = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=None, entries=[], cursor=0), headers=sync_headers(auth, token))
    assert pull.status_code == 200
    assert pull.json()["entries"][0]["lot"] == "000123"


def test_sync_preserves_conflicts_and_tombstones() -> None:
    account, auth = register("owner@example.com", "Equipe principal")
    team_id = account["user"]["teams"][0]["id"]
    inventory_id, entry_id, token = str(uuid4()), str(uuid4()), str(uuid4())
    initial = entry(inventory_id, entry_id, "ORIGINAL")
    client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=inventory(inventory_id), entries=[initial]), headers=sync_headers(auth, token))

    accepted = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=None, entries=[entry(inventory_id, entry_id, "VERSAO-A", revision=2, base_revision=1)]), headers=sync_headers(auth, token))
    assert accepted.status_code == 200

    conflict = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=None, entries=[entry(inventory_id, entry_id, "VERSAO-B", revision=2, base_revision=1)]), headers=sync_headers(auth, token))
    assert conflict.status_code == 200
    assert conflict.json()["conflicts"][0]["serverRecord"]["lot"] == "VERSAO-A"

    deleted = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=None, entries=[entry(inventory_id, entry_id, "VERSAO-A", revision=3, base_revision=2, tombstone=True)]), headers=sync_headers(auth, token))
    assert deleted.status_code == 200
    assert deleted.json()["acknowledged"]["entryIds"] == [entry_id]


def test_known_uuid_and_sync_token_do_not_allow_another_team() -> None:
    owner, owner_auth = register("owner@example.com", "Equipe A")
    owner_team = owner["user"]["teams"][0]["id"]
    inventory_id, token = str(uuid4()), str(uuid4())
    created = client.post("/api/v1/sync", json=sync_payload(inventory_id, owner_team, inventory_record=inventory(inventory_id), entries=[]), headers=sync_headers(owner_auth, token))
    assert created.status_code == 200

    outsider, outsider_auth = register("outside@example.com", "Equipe B")
    outsider_team = outsider["user"]["teams"][0]["id"]
    idor = client.post("/api/v1/sync", json=sync_payload(inventory_id, outsider_team, inventory_record=None, entries=[]), headers=sync_headers(outsider_auth, token))
    assert idor.status_code == 404


def test_operator_can_sync_but_cannot_manage_members() -> None:
    owner, owner_auth = register("owner@example.com", "Equipe A")
    team_id = owner["user"]["teams"][0]["id"]
    operator, _operator_auth = register("operator@example.com", "Equipe temporária")
    added = client.post(f"/api/v1/teams/{team_id}/members", json={"email": "operator@example.com", "role": "OPERATOR"}, headers=owner_auth)
    assert added.status_code == 200

    logged_in = client.post("/api/v1/auth/login", json={"email": "operator@example.com", "password": "senha-segura-123"})
    operator_auth = {"Authorization": f"Bearer {logged_in.json()['accessToken']}"}
    inventory_id, token = str(uuid4()), str(uuid4())
    synced = client.post("/api/v1/sync", json=sync_payload(inventory_id, team_id, inventory_record=inventory(inventory_id), entries=[]), headers=sync_headers(operator_auth, token))
    assert synced.status_code == 200
    forbidden = client.post(f"/api/v1/teams/{team_id}/members", json={"email": "owner@example.com", "role": "OPERATOR"}, headers=operator_auth)
    assert forbidden.status_code == 403
