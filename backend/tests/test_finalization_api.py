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
    entry = {"id": entry_id, "inventoryId": inventory_id, "side": "DE", "bay": "15", "lot": "2712345678", "quantity": 19, "revision": 1, "syncBaseRevision": 0, "tombstone": False, "deletedAt": None, **_times()}
    headers = {**auth, "X-Inventory-Sync-Token": token}
    synced = client.post("/api/v1/sync", json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": inventory, "entries": [entry]}, headers=headers)
    assert synced.status_code == 200

    finished = client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 1}, headers=headers)
    assert finished.status_code == 200
    assert finished.json()["status"] == "FINISHED"
    history = client.get(f"/api/v1/inventories/history?teamId={team_id}", headers=auth)
    assert history.status_code == 200
    assert history.json()[0]["id"] == inventory_id
    for extension, media_type in [("xls", "application/vnd.ms-excel"), ("xlsx", "spreadsheetml"), ("pdf", "application/pdf"), ("docx", "wordprocessingml")]:
        exported = client.get(f"/api/v1/inventories/{inventory_id}/exports/{extension}", headers=headers)
        assert exported.status_code == 200
        assert media_type in exported.headers["content-type"]
        assert f"Inventario_2026-09-11.{extension}" in exported.headers["content-disposition"]
        assert int(exported.headers["content-length"]) == len(exported.content) > 0
    default_excel = client.get(f"/api/v1/inventories/{inventory_id}/export/excel", headers=headers)
    assert default_excel.status_code == 200
    assert default_excel.headers["content-type"].startswith("application/vnd.ms-excel")
    assert "Inventario_2026-09-11.xls" in default_excel.headers["content-disposition"]
    assert int(default_excel.headers["content-length"]) == len(default_excel.content) > 0
    modern_excel = client.get(f"/api/v1/inventories/{inventory_id}/export/excel?format=xlsx", headers=headers)
    assert modern_excel.status_code == 200
    assert modern_excel.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert "Inventario_2026-09-11.xlsx" in modern_excel.headers["content-disposition"]
    assert int(modern_excel.headers["content-length"]) == len(modern_excel.content) > 0

    for extension, media_type in [("xlsx", "spreadsheetml"), ("docx", "wordprocessingml")]:
        link_response = client.post(
            f"/api/v1/inventories/{inventory_id}/share-links/{extension}",
            headers=headers,
        )
        assert link_response.status_code == 200
        shared_path = link_response.json()["path"]
        assert "expires=" in shared_path and "signature=" in shared_path
        shared_export = client.get(shared_path)
        assert shared_export.status_code == 200
        assert media_type in shared_export.headers["content-type"]

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


def test_empty_inventory_can_be_finalized_with_zeroed_report() -> None:
    account, auth = _register("finalize-empty@gerdau.com.br")
    team_id = account["user"]["teams"][0]["id"]
    inventory_id, token = str(uuid4()), str(uuid4())
    headers = {**auth, "X-Inventory-Sync-Token": token}
    inventory = {"id": inventory_id, "date": "2026-09-19", "status": "OPEN", "revision": 1, "syncBaseRevision": 0, "tombstone": False, "deletedAt": None, **_times()}

    synced = client.post(
        "/api/v1/sync",
        json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "teamId": team_id, "cursor": 0, "inventory": inventory, "entries": []},
        headers=headers,
    )
    assert synced.status_code == 200

    finalized = client.post(f"/api/v1/inventories/{inventory_id}/finalize", json={"revision": 1}, headers=headers)
    assert finalized.status_code == 200
    assert finalized.json()["status"] == "FINISHED"
    assert finalized.json()["summary"]["lotsAnalyzed"] == 0

    report = client.get(f"/api/v1/inventories/{inventory_id}/report", headers=headers)
    assert report.status_code == 200
    assert report.json()["lots"] == []
    assert report.json()["summary"]["lotsAnalyzed"] == 0
