from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def record_times() -> dict[str, str]:
    now = datetime.now(timezone.utc).isoformat()
    return {"createdAt": now, "updatedAt": now}


def inventory(inventory_id: str, revision: int = 1, base_revision: int = 0) -> dict[str, object]:
    return {
        "id": inventory_id,
        "date": "2026-09-11",
        "status": "OPEN",
        "revision": revision,
        "syncBaseRevision": base_revision,
        "tombstone": False,
        "deletedAt": None,
        **record_times(),
    }


def entry(inventory_id: str, entry_id: str, lot: str, revision: int = 1, base_revision: int = 0) -> dict[str, object]:
    return {
        "id": entry_id,
        "inventoryId": inventory_id,
        "side": "EF",
        "bay": "01",
        "lot": lot,
        "quantity": 3,
        "revision": revision,
        "syncBaseRevision": base_revision,
        "tombstone": False,
        "deletedAt": None,
        **record_times(),
    }


def sync_payload(inventory_id: str, *, inventory_record: dict[str, object] | None, entries: list[dict[str, object]], cursor: int = 0) -> dict[str, object]:
    return {
        "deviceId": str(uuid4()),
        "inventoryId": inventory_id,
        "cursor": cursor,
        "inventory": inventory_record,
        "entries": entries,
    }


def test_sync_is_idempotent_and_returns_incremental_changes() -> None:
    inventory_id = str(uuid4())
    entry_id = str(uuid4())
    token = str(uuid4())
    payload = sync_payload(inventory_id, inventory_record=inventory(inventory_id), entries=[entry(inventory_id, entry_id, "000123")])

    first = client.post("/api/v1/sync", json=payload, headers={"X-Inventory-Sync-Token": token})
    assert first.status_code == 200
    body = first.json()
    assert body["acknowledged"] == {"inventory": True, "entryIds": [entry_id]}
    assert len(body["entries"]) == 1
    cursor = body["cursor"]

    replay = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=inventory(inventory_id), entries=[entry(inventory_id, entry_id, "000123")], cursor=cursor),
        headers={"X-Inventory-Sync-Token": token},
    )
    assert replay.status_code == 200
    assert replay.json()["entries"] == []

    pull = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=None, entries=[], cursor=0),
        headers={"X-Inventory-Sync-Token": token},
    )
    assert pull.status_code == 200
    assert pull.json()["cursor"] == cursor
    assert pull.json()["entries"][0]["lot"] == "000123"


def test_sync_preserves_conflicting_versions_and_rejects_invalid_token() -> None:
    inventory_id = str(uuid4())
    entry_id = str(uuid4())
    token = str(uuid4())
    initial = entry(inventory_id, entry_id, "ORIGINAL")
    client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=inventory(inventory_id), entries=[initial]),
        headers={"X-Inventory-Sync-Token": token},
    )

    winning = entry(inventory_id, entry_id, "VERSAO-A", revision=2, base_revision=1)
    accepted = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=None, entries=[winning]),
        headers={"X-Inventory-Sync-Token": token},
    )
    assert accepted.status_code == 200
    assert accepted.json()["acknowledged"]["entryIds"] == [entry_id]

    competing = entry(inventory_id, entry_id, "VERSAO-B", revision=2, base_revision=1)
    conflict = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=None, entries=[competing]),
        headers={"X-Inventory-Sync-Token": token},
    )
    assert conflict.status_code == 200
    assert conflict.json()["conflicts"][0]["serverRecord"]["lot"] == "VERSAO-A"

    pull = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=None, entries=[], cursor=0),
        headers={"X-Inventory-Sync-Token": token},
    )
    assert pull.json()["entries"][-1]["lot"] == "VERSAO-A"

    forbidden = client.post(
        "/api/v1/sync",
        json=sync_payload(inventory_id, inventory_record=None, entries=[]),
        headers={"X-Inventory-Sync-Token": str(uuid4())},
    )
    assert forbidden.status_code == 403
