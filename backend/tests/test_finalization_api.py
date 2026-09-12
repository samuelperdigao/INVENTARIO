from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from auth_helpers import register_verified


client = TestClient(app)


def _times() -> dict[str, str]:
    value = datetime.now(timezone.utc).isoformat()
    return {"createdAt": value, "updatedAt": value}


def _register(email: str) -> tuple[dict[str, object], dict[str, str]]:
    return register_verified(client, email, "Equipe")


def test_finalization_history_and_exports_are_authorized_and_immutable() -> None:
    account, auth = _register("finalize@gerdau.com.br")
    team_id = account["user"]["teams"][0]["id"]
    inventory_id, entry_id, token = str(uuid4()), str(uuid4()), str(uuid4())
    inventory = {"id": inventory_id, "date": "2026-09-11", "status": "OPEN", "revision": 1, "syncBaseRevision": 0, "tombstone": False, "deletedAt": None, **_times()}
    entry = {"id": entry_id, "inventoryId": inventory_id, "side": "DE", "bay": "15", "lot": "000123", "quantity": 19, "revision": 1, "syncBaseRevision": 0, "tombstone": False, "deletedAt": None, **_times()}
    headers = {**auth, "X-Inventory-Sync-Token": token}
    synced = client.post("/api/v1/sync", json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": inventory, "entries": [entry]}, headers=headers)
    assert synced.status_code == 200

    finished = client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 1}, headers=headers)
    assert finished.status_code == 200
    assert finished.json()["status"] == "FINISHED"
    history = client.get(f"/api/v1/inventories/history?teamId={team_id}", headers=auth)
    assert history.status_code == 200
    assert history.json()[0]["id"] == inventory_id
    for extension, media_type in [("xlsx", "spreadsheetml"), ("pdf", "application/pdf"), ("docx", "wordprocessingml")]:
        exported = client.get(f"/api/v1/inventories/{inventory_id}/exports/{extension}", headers=headers)
        assert exported.status_code == 200
        assert media_type in exported.headers["content-type"]
        assert f". {extension}".replace(" ", "") in exported.headers["content-disposition"]
    rejected = client.post("/api/v1/sync", json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": None, "entries": [entry]}, headers=headers)
    assert rejected.status_code == 409

    _, outsider_auth = _register("finalize-outsider@gerdau.com.br")
    denied = client.get(f"/api/v1/inventories/{inventory_id}/exports/pdf", headers={**outsider_auth, "X-Inventory-Sync-Token": token})
    assert denied.status_code == 404
    denied_finalization = client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 2}, headers={**outsider_auth, "X-Inventory-Sync-Token": token})
    assert denied_finalization.status_code == 404


def test_sync_cannot_set_finished_without_the_finalization_endpoint() -> None:
    account, auth = _register("sync-status@gerdau.com.br")
    team_id = account["user"]["teams"][0]["id"]
    inventory_id, token = str(uuid4()), str(uuid4())
    inventory = {
        "id": inventory_id,
        "date": "2026-09-11",
        "status": "FINISHED",
        "revision": 1,
        "syncBaseRevision": 0,
        "tombstone": False,
        "deletedAt": None,
        **_times(),
    }
    response = client.post(
        "/api/v1/sync",
        json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": inventory, "entries": []},
        headers={**auth, "X-Inventory-Sync-Token": token},
    )
    assert response.status_code == 422
    assert client.post(
        "/api/v1/sync",
        json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": None, "entries": []},
        headers={**auth, "X-Inventory-Sync-Token": token},
    ).status_code == 404
