from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_preview_contract_and_server_validation() -> None:
    response = client.post(
        "/api/v1/analysis/preview",
        json={
            "inventory": {"id": str(uuid4()), "date": "2026-09-11", "revision": 2},
            "entries": [
                {"id": str(uuid4()), "side": "DE", "bay": "15", "layer": "A1", "lot": "000123", "quantity": 19},
                {"id": str(uuid4()), "side": "EF", "bay": "21", "layer": "A10", "lot": "000123", "quantity": 1},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["revision"] == 2
    assert body["lots"][0]["classification"] == "PEÇA_SOLTEIRA"
    assert body["lots"][0]["locations"][0]["layer"] in {"A1", "A10"}
    assert body["lots"][0]["presentation"]["situation"] == "1 PEÇA FORA DO LOCAL PRINCIPAL"
    assert body["lots"][0]["presentation"]["primaryLocation"]["display"].endswith("19 pç")
    assert body["summary"]["lotsForConference"] == 1

    invalid_lot = client.post(
        "/api/v1/analysis/preview",
        json={"inventory": {"id": str(uuid4()), "date": "2026-09-11", "revision": 1}, "entries": [
            {"id": str(uuid4()), "side": "EF", "bay": "1", "layer": "A1", "lot": "ABC", "quantity": 1}
        ]},
    )
    assert invalid_lot.status_code == 422

    invalid_layer = client.post(
        "/api/v1/analysis/preview",
        json={"inventory": {"id": str(uuid4()), "date": "2026-09-11", "revision": 1}, "entries": [
            {"id": str(uuid4()), "side": "EF", "bay": "1", "layer": "A11", "lot": "123", "quantity": 1}
        ]},
    )
    assert invalid_layer.status_code == 422
