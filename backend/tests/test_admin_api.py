from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.database import get_session
from app.main import app
from app.persistence import SystemAdminRow
from auth_helpers import register_verified


client = TestClient(app)


def grant_admin(user_id: str) -> None:
    generator = app.dependency_overrides[get_session]()
    session = next(generator)
    try:
        session.add(SystemAdminRow(user_id=user_id, granted_at=datetime.now(timezone.utc)))
        session.commit()
    finally:
        generator.close()


def create_inventory(auth: dict[str, str]) -> tuple[str, str, str]:
    inventory_id, entry_id, token = str(uuid4()), str(uuid4()), str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    response = client.post("/api/v1/sync", headers={**auth, "X-Inventory-Sync-Token": token}, json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0, "teamId": None,
        "inventory": {"id": inventory_id, "date": "2026-09-23", "status": "OPEN", "revision": 1,
                      "syncBaseRevision": 0, "createdAt": now, "updatedAt": now, "tombstone": False},
        "entries": [{"id": entry_id, "inventoryId": inventory_id, "side": "DE", "bay": "15",
                     "lot": "2712345678", "quantity": 4, "revision": 1, "syncBaseRevision": 0,
                     "createdAt": now, "updatedAt": now, "tombstone": False}],
    })
    assert response.status_code == 200, response.text
    return inventory_id, entry_id, token


def revision(inventory: dict) -> dict:
    return {"expectedRevision": inventory["revision"], "expectedGeneration": inventory["operationalGeneration"]}


def workbook(second_lot: str = "2811111111") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["Produto", "Lotes", "Peso"])
    ws.append(["Viga", "2712345678", 2000])
    ws.append(["Bloco", second_lot, 1000])
    output = BytesIO()
    wb.save(output)
    return output.getvalue()


def test_permission_is_global_and_independent_of_team_admin() -> None:
    operator, auth = register_verified(client, "normal-admin-test@example.com", "Equipe")
    assert operator["user"]["teams"][0]["role"] == "ADMIN"
    assert operator["user"]["systemAdmin"] is False
    assert client.get("/api/v1/admin/overview", headers=auth).status_code == 403
    inventory_id, _entry_id, _token = create_inventory(auth)
    assert client.get(f"/api/v1/admin/inventories/{inventory_id}", headers=auth).status_code == 403
    assert client.post(f"/api/v1/admin/inventories/{inventory_id}/delete", headers=auth, json={
        "expectedRevision": 1, "expectedGeneration": 1,
    }).status_code == 403
    assert client.post(f"/api/v1/admin/inventories/{inventory_id}/finalize", headers=auth, json={
        "expectedRevision": 1, "expectedGeneration": 1,
    }).status_code == 403
    assert client.get("/api/v1/admin/overview").status_code == 401
    grant_admin(operator["user"]["id"])
    refreshed = client.get("/api/v1/auth/me", headers=auth)
    assert refreshed.json()["systemAdmin"] is True
    assert client.get("/api/v1/admin/overview", headers=auth).json()["total"] == 1


def test_admin_full_cycle_versions_reference_transfer_offline_and_delete() -> None:
    operator, auth_operator = register_verified(client, "operator-cycle@example.com")
    new_owner, auth_new_owner = register_verified(client, "new-owner-cycle@example.com")
    admin, auth_admin = register_verified(client, "global-cycle@example.com")
    grant_admin(admin["user"]["id"])
    inventory_id, entry_id, token = create_inventory(auth_operator)
    path = f"/api/v1/admin/inventories/{inventory_id}"
    detail = client.get(path, headers=auth_admin).json()
    assert detail["ownerUserId"] == operator["user"]["id"]
    assert detail["entries"][0]["lot"] == "2712345678"
    assert client.get("/api/v1/admin/inventories?query=2712345678", headers=auth_admin).json()["total"] == 1

    duplicated = client.post(f"{path}/entries", headers=auth_admin, json={
        **revision(detail), "side": "DE", "bay": "15", "lot": "2712345678", "quantity": 1,
    })
    assert duplicated.status_code == 409
    blank_bay = client.post(f"{path}/entries", headers=auth_admin, json={
        **revision(detail), "side": "DE", "bay": "   ", "lot": "2812345678", "quantity": 1,
    })
    assert blank_bay.status_code == 422

    created = client.post(f"{path}/entries", headers=auth_admin, json={
        **revision(detail), "side": "EF", "bay": "21", "lot": "2812345678", "quantity": 2,
    })
    assert created.status_code == 200, created.text
    detail = created.json()["inventory"]
    assert detail["pieceCount"] == 6
    assert client.post(f"{path}/entries/{entry_id}", headers=auth_admin, json={
        **revision({**detail, "revision": 1}), "side": "EF", "bay": "22",
        "lot": "2712345678", "quantity": 5,
    }).status_code == 409

    changed = client.post(f"{path}/entries/{entry_id}", headers=auth_admin, json={
        **revision(detail), "side": "EF", "bay": "22", "lot": "2712345678", "quantity": 5,
    })
    assert changed.status_code == 200, changed.text
    detail = changed.json()
    assert detail["pieceCount"] == 7
    assert detail["entries"][0]["createdByUserId"] == operator["user"]["id"]

    reference = client.post(f"{path}/reference", headers=auth_admin, data={
        **{k: str(v) for k, v in revision(detail).items()}, "reason": "Conferência de lotes SAP",
    }, files={"file": ("sap.xlsx", workbook(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert reference.status_code == 200, reference.text
    detail = reference.json()
    assert detail["reference"]["summary"]["totalLots"] == 2
    comparison = client.get(f"{path}/reference", headers=auth_admin).json()
    assert comparison["summary"]["foundLots"] == 1
    assert comparison["summary"]["pendingLots"] == 1
    assert comparison["outsideLots"] == [{"lotNumber": "2812345678", "physicalQuantity": 2}]

    replaced = client.post(f"{path}/reference", headers=auth_admin, data={
        **{k: str(v) for k, v in revision(detail).items()}, "reason": "Atualizar referência recebida do SAP",
    }, files={"file": ("sap-atualizado.xlsx", workbook("2812345678"),
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert replaced.status_code == 200, replaced.text
    detail = replaced.json()
    assert detail["reference"]["reference"]["revision"] == 2
    assert client.get(f"{path}/reference", headers=auth_admin).json()["summary"]["foundLots"] == 2

    headers = {**auth_operator, "X-Inventory-Sync-Token": token}
    finalized = client.post(f"/api/v1/inventories/{inventory_id}/finalize",
                            headers=headers, json={"revision": detail["revision"]})
    assert finalized.status_code == 200, finalized.text
    detail = client.get(path, headers=auth_admin).json()
    assert detail["reportVersion"] == 1
    old_report = client.get(f"{path}/versions/1", headers=auth_admin).json()
    assert old_report["totalPieces"] == 7

    corrected = client.post(f"{path}/entries/{entry_id}", headers=auth_admin, json={
        **revision(detail), "reason": "Corrigir contagem conferida", "side": "EF",
        "bay": "22", "lot": "2712345678", "quantity": 9,
    })
    assert corrected.status_code == 200, corrected.text
    detail = corrected.json()
    assert detail["status"] == "FINISHED" and detail["reportVersion"] == 2
    assert client.get(f"{path}/versions/1", headers=auth_admin).json()["totalPieces"] == 7
    assert client.get(f"{path}/versions/2", headers=auth_admin).json()["totalPieces"] == 11
    assert client.get(f"{path}/export/xls?version=1", headers=auth_admin).content[:4] == bytes.fromhex("d0cf11e0")

    removed_ref = client.post(f"{path}/reference/remove", headers=auth_admin,
                              json={**revision(detail), "reason": "Substituir referência desatualizada"})
    assert removed_ref.status_code == 200, removed_ref.text
    detail = removed_ref.json()
    assert detail["reportVersion"] == 3
    assert client.get(f"{path}/versions/2", headers=auth_admin).json()["reference"]["totalLots"] == 2

    reopened = client.post(f"{path}/reopen", headers=auth_admin,
                           json={**revision(detail), "reason": "Nova conferência física"})
    assert reopened.status_code == 200, reopened.text
    detail = reopened.json()
    assert detail["status"] == "OPEN" and detail["operationalGeneration"] == 2
    assert detail["entries"][0]["operationalGeneration"] == 2
    assert client.get(f"{path}/versions/3", headers=auth_admin).status_code == 200
    assigned_original = client.get("/api/v1/inventories/assigned", headers=auth_operator).json()
    assert len(assigned_original) == 1
    assert assigned_original[0]["inventoryId"] == inventory_id
    assert assigned_original[0]["operationalGeneration"] == 2
    assert "accessToken" in assigned_original[0]
    reopened_pull = client.post("/api/v1/sync", headers={
        **auth_operator, "X-Inventory-Sync-Token": assigned_original[0]["accessToken"],
    }, json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
             "operationalGeneration": 1, "inventory": None, "entries": []})
    assert reopened_pull.status_code == 200
    assert reopened_pull.json()["inventory"]["status"] == "OPEN"
    assert reopened_pull.json()["inventory"]["operationalGeneration"] == 2
    assert reopened_pull.json()["entries"][0]["operationalGeneration"] == 2
    assert client.post(f"/api/v1/inventories/{inventory_id}/finalize", headers=headers,
                       json={"revision": detail["revision"], "operationalGeneration": 1}).status_code == 409
    assert client.delete(f"/api/v1/inventories/{inventory_id}/reference",
                         headers={**headers, "X-Inventory-Generation": "1"}).status_code == 409
    old_device = client.post("/api/v1/sync", headers=headers, json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
        "operationalGeneration": 1, "inventory": None,
        "entries": [{"id": str(uuid4()), "inventoryId": inventory_id, "side": "DE", "bay": "5",
                     "lot": "2711111111", "quantity": 1, "revision": 1, "syncBaseRevision": 0,
                     "createdAt": datetime.now(timezone.utc).isoformat(),
                     "updatedAt": datetime.now(timezone.utc).isoformat(), "tombstone": False}],
    })
    assert old_device.status_code == 409
    pull = client.post("/api/v1/sync", headers=headers, json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
        "operationalGeneration": 1, "inventory": None, "entries": [],
    })
    assert pull.status_code == 200 and pull.json()["inventory"]["operationalGeneration"] == 2

    transferred = client.post(f"{path}/transfer", headers=auth_admin, json={
        **revision(detail), "reason": "Novo responsável pelo inventário",
        "newOwnerUserId": new_owner["user"]["id"],
    })
    assert transferred.status_code == 200, transferred.text
    detail = transferred.json()
    assigned = client.get("/api/v1/inventories/assigned", headers=auth_new_owner).json()
    assert len(assigned) == 1 and assigned[0]["inventoryId"] == inventory_id
    assert client.get("/api/v1/inventories/assigned", headers=auth_operator).json() == []
    old_owner_sync = client.post("/api/v1/sync", headers={
        **auth_operator, "X-Inventory-Sync-Token": assigned_original[0]["accessToken"],
    }, json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
             "operationalGeneration": 2, "inventory": None, "entries": []})
    assert old_owner_sync.status_code == 404
    claimed = client.post("/api/v1/sync", headers={
        **auth_new_owner, "X-Inventory-Sync-Token": assigned[0]["accessToken"],
    }, json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
             "operationalGeneration": 2, "inventory": None, "entries": []})
    assert claimed.status_code == 200, claimed.text
    assert client.post("/api/v1/sync", headers=headers, json={
        "deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
        "operationalGeneration": 2, "inventory": None, "entries": [],
    }).status_code == 404

    newly_finalized = client.post(f"/api/v1/inventories/{inventory_id}/finalize",
        headers={**auth_new_owner, "X-Inventory-Sync-Token": assigned[0]["accessToken"]},
        json={"revision": detail["revision"], "operationalGeneration": 2})
    assert newly_finalized.status_code == 200, newly_finalized.text
    detail = client.get(path, headers=auth_admin).json()
    assert detail["reportVersion"] == 4 and detail["status"] == "FINISHED"
    assert client.get(f"{path}/versions/1", headers=auth_admin).json()["totalPieces"] == 7
    assert client.get(f"{path}/versions/4", headers=auth_admin).json()["totalPieces"] == 11

    deleted = client.post(f"{path}/delete", headers=auth_admin, json=revision(detail))
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["tombstone"] is True
    assert client.get("/api/v1/admin/inventories", headers=auth_admin).json()["total"] == 0
    assert client.get("/api/v1/admin/inventories?deleted=true", headers=auth_admin).json()["total"] == 1
    assert client.get(f"{path}/versions/1", headers=auth_admin).status_code == 200
    assert client.get(f"/api/v1/inventories/{inventory_id}/report", headers=headers).status_code == 404
    assert client.post("/api/v1/sync", headers={**auth_new_owner, "X-Inventory-Sync-Token": assigned[0]["accessToken"]},
        json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
              "operationalGeneration": 2, "inventory": None, "entries": []}).json()["inventory"]["tombstone"] is True
    audit = client.get(f"/api/v1/admin/audit?inventoryId={inventory_id}", headers=auth_admin).json()["items"]
    deleted_audit = next(item for item in audit if item["action"] == "INVENTORY_DELETED")
    assert deleted_audit["reason"] is None
    assert deleted_audit["actorName"] == admin["user"]["displayName"]
    assert deleted_audit["before"]["tombstone"] is False
    assert deleted_audit["after"]["tombstone"] is True
    assert deleted_audit["reportVersion"] == detail["reportVersion"]
    assert len(audit) >= 7


def test_admin_removes_finalized_entry_and_preserves_preceding_report() -> None:
    operator, auth_operator = register_verified(client, "operator-remove@example.com")
    admin, auth_admin = register_verified(client, "admin-remove@example.com")
    grant_admin(admin["user"]["id"])
    inventory_id, entry_id, token = create_inventory(auth_operator)
    path = f"/api/v1/admin/inventories/{inventory_id}"
    detail = client.get(path, headers=auth_admin).json()
    finalized = client.post(f"/api/v1/inventories/{inventory_id}/finalize",
        headers={**auth_operator, "X-Inventory-Sync-Token": token},
        json={"revision": detail["revision"]})
    assert finalized.status_code == 200
    detail = client.get(path, headers=auth_admin).json()

    missing_reason = client.post(f"{path}/entries/{entry_id}/remove", headers=auth_admin, json=revision(detail))
    assert missing_reason.status_code == 422
    stale_revision = client.post(f"{path}/entries/{entry_id}/remove", headers=auth_admin,
        json={**revision(detail), "expectedRevision": detail["revision"] - 1,
              "reason": "Remover lançamento incorreto"})
    assert stale_revision.status_code == 409
    removed = client.post(f"{path}/entries/{entry_id}/remove", headers=auth_admin,
        json={**revision(detail), "reason": "Remover lançamento incorreto"})
    assert removed.status_code == 200, removed.text
    result = removed.json()
    assert result["status"] == "FINISHED" and result["pieceCount"] == 0
    assert result["reportVersion"] == 2
    assert client.get(f"{path}/versions/1", headers=auth_admin).json()["totalPieces"] == 4
    assert client.get(f"{path}/versions/2", headers=auth_admin).json()["totalPieces"] == 0
    audit = client.get(f"/api/v1/admin/audit?inventoryId={inventory_id}", headers=auth_admin).json()
    removal = next(item for item in audit["items"] if item["action"] == "ENTRY_REMOVED")
    assert removal["entryId"] == entry_id
    assert removal["before"]["quantity"] == 4 and removal["after"]["tombstone"] is True
    assert removal["reportVersion"] == 2


def test_admin_finalizes_reopened_generation_and_preserves_each_official_version() -> None:
    operator, auth_operator = register_verified(client, "operator-admin-finalize@example.com")
    admin, auth_admin = register_verified(client, "admin-finalize-cycle@example.com")
    grant_admin(admin["user"]["id"])
    inventory_id, _entry_id, token = create_inventory(auth_operator)
    path = f"/api/v1/admin/inventories/{inventory_id}"
    detail = client.get(path, headers=auth_admin).json()

    first = client.post(f"/api/v1/inventories/{inventory_id}/finalize",
        headers={**auth_operator, "X-Inventory-Sync-Token": token},
        json={"revision": detail["revision"], "operationalGeneration": 1})
    assert first.status_code == 200, first.text
    detail = client.get(path, headers=auth_admin).json()
    first_report = client.get(f"{path}/versions/1", headers=auth_admin).json()

    reopened = client.post(f"{path}/reopen", headers=auth_admin,
        json={**revision(detail), "reason": "Retomar conferência autorizada"})
    assert reopened.status_code == 200, reopened.text
    detail = reopened.json()
    assert detail["status"] == "OPEN" and detail["operationalGeneration"] == 2
    assigned = client.get("/api/v1/inventories/assigned", headers=auth_operator).json()
    assert len(assigned) == 1 and assigned[0]["status"] == "OPEN"

    finalized = client.post(f"{path}/finalize", headers=auth_admin, json=revision(detail))
    assert finalized.status_code == 200, finalized.text
    final_detail = finalized.json()
    assert final_detail["status"] == "FINISHED"
    assert final_detail["finalizedAt"]
    assert final_detail["reportVersion"] == 2
    assert final_detail["revision"] == detail["revision"] + 1
    finalized_assignment = client.get("/api/v1/inventories/assigned", headers=auth_operator).json()
    assert len(finalized_assignment) == 1
    assert finalized_assignment[0]["inventoryId"] == inventory_id
    assert finalized_assignment[0]["status"] == "FINISHED"
    assert finalized_assignment[0]["revision"] == final_detail["revision"]
    owner_pull = client.post("/api/v1/sync", headers={
        **auth_operator, "X-Inventory-Sync-Token": assigned[0]["accessToken"],
    }, json={"deviceId": str(uuid4()), "inventoryId": inventory_id, "cursor": 0,
             "operationalGeneration": 2, "inventory": None, "entries": []})
    assert owner_pull.status_code == 200
    assert owner_pull.json()["inventory"]["status"] == "FINISHED"
    assert client.get(f"{path}/versions/1", headers=auth_admin).json() == first_report
    assert client.get(f"{path}/versions/2", headers=auth_admin).json()["totalPieces"] == 4

    audit_items = client.get(f"/api/v1/admin/audit?inventoryId={inventory_id}", headers=auth_admin).json()["items"]
    action = next(item for item in audit_items if item["action"] == "FINALIZED_BY_ADMIN")
    assert action["actorName"] == admin["user"]["displayName"]
    assert action["reason"] is None
    assert action["inventoryRevision"] == final_detail["revision"]
    assert action["operationalGeneration"] == 2
    assert action["reportVersion"] == 2
    assert action["before"]["status"] == "OPEN"
    assert action["after"]["status"] == "FINISHED"
    assert action["after"]["finalizedByUserId"] == admin["user"]["id"]

    reopened_again = client.post(f"{path}/reopen", headers=auth_admin,
        json={**revision(final_detail), "reason": "Abrir novo ciclo de conferência"})
    assert reopened_again.status_code == 200, reopened_again.text
    assert reopened_again.json()["status"] == "OPEN"
    assert reopened_again.json()["operationalGeneration"] == 3
    assert reopened_again.json()["reportVersion"] == 2
    assert client.get(f"{path}/versions/1", headers=auth_admin).status_code == 200
    assert client.get(f"{path}/versions/2", headers=auth_admin).status_code == 200


def test_transfer_finished_inventory_stays_in_history_and_reopen_order_is_consistent() -> None:
    owner_a, auth_a = register_verified(client, "owner-transfer-a@example.com")
    owner_b, auth_b = register_verified(client, "owner-transfer-b@example.com")
    admin, auth_admin = register_verified(client, "admin-transfer-order@example.com")
    grant_admin(admin["user"]["id"])

    finished_id, _entry_id, finished_token = create_inventory(auth_a)
    finished_path = f"/api/v1/admin/inventories/{finished_id}"
    finished_detail = client.get(finished_path, headers=auth_admin).json()
    finalized = client.post(f"/api/v1/inventories/{finished_id}/finalize",
        headers={**auth_a, "X-Inventory-Sync-Token": finished_token},
        json={"revision": finished_detail["revision"], "operationalGeneration": 1})
    assert finalized.status_code == 200
    finished_detail = client.get(finished_path, headers=auth_admin).json()
    transferred_finished = client.post(f"{finished_path}/transfer", headers=auth_admin, json={
        **revision(finished_detail), "reason": "Transferir histórico para responsável atual",
        "newOwnerUserId": owner_b["user"]["id"],
    })
    assert transferred_finished.status_code == 200
    assert transferred_finished.json()["status"] == "FINISHED"
    assert transferred_finished.json()["ownerUserId"] == owner_b["user"]["id"]
    history_b = client.get("/api/v1/inventories/history", headers=auth_b).json()
    assert any(item["id"] == finished_id for item in history_b)
    assert all(item["id"] != finished_id for item in client.get("/api/v1/inventories/history", headers=auth_a).json())
    assert next(item for item in client.get("/api/v1/inventories/assigned", headers=auth_b).json()
                if item["inventoryId"] == finished_id)["status"] == "FINISHED"

    reopened_after_transfer = client.post(f"{finished_path}/reopen", headers=auth_admin, json={
        **revision(transferred_finished.json()), "reason": "Reabrir para nova conferência",
    })
    assert reopened_after_transfer.status_code == 200
    assert reopened_after_transfer.json()["ownerUserId"] == owner_b["user"]["id"]
    assert reopened_after_transfer.json()["operationalGeneration"] == 2
    assert next(item for item in client.get("/api/v1/inventories/assigned", headers=auth_b).json()
                if item["inventoryId"] == finished_id)["status"] == "OPEN"

    reopen_first_id, _entry_id, reopen_first_token = create_inventory(auth_a)
    reopen_first_path = f"/api/v1/admin/inventories/{reopen_first_id}"
    reopen_first_detail = client.get(reopen_first_path, headers=auth_admin).json()
    finalized_first = client.post(f"/api/v1/inventories/{reopen_first_id}/finalize",
        headers={**auth_a, "X-Inventory-Sync-Token": reopen_first_token},
        json={"revision": reopen_first_detail["revision"], "operationalGeneration": 1})
    assert finalized_first.status_code == 200
    reopen_first_detail = client.get(reopen_first_path, headers=auth_admin).json()
    reopened_first = client.post(f"{reopen_first_path}/reopen", headers=auth_admin, json={
        **revision(reopen_first_detail), "reason": "Iniciar a segunda geração operacional",
    })
    assert reopened_first.status_code == 200
    transferred_after_reopen = client.post(f"{reopen_first_path}/transfer", headers=auth_admin, json={
        **revision(reopened_first.json()), "reason": "Atribuir inventário reaberto ao novo responsável",
        "newOwnerUserId": owner_b["user"]["id"],
    })
    assert transferred_after_reopen.status_code == 200
    assert transferred_after_reopen.json()["status"] == "OPEN"
    assert transferred_after_reopen.json()["operationalGeneration"] == 2
    assert all(item["inventoryId"] != reopen_first_id for item in client.get("/api/v1/inventories/assigned", headers=auth_a).json())
    b_assigned = client.get("/api/v1/inventories/assigned", headers=auth_b).json()
    assert any(item["inventoryId"] == reopen_first_id and item["status"] == "OPEN" for item in b_assigned)
    owner_token = next(item["accessToken"] for item in b_assigned if item["inventoryId"] == reopen_first_id)
    connected = client.post("/api/v1/sync", headers={**auth_b, "X-Inventory-Sync-Token": owner_token}, json={
        "deviceId": str(uuid4()), "inventoryId": reopen_first_id, "cursor": 0,
        "operationalGeneration": 1, "inventory": None, "entries": [],
    })
    assert connected.status_code == 200
    assert connected.json()["inventory"]["status"] == "OPEN"
    assert connected.json()["inventory"]["operationalGeneration"] == 2
