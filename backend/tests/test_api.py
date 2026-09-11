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
                {"id": str(uuid4()), "side": "DE", "bay": "15", "lot": "000123", "quantity": 19},
                {"id": str(uuid4()), "side": "EF", "bay": "21", "lot": "000123", "quantity": 1},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["revision"] == 2
    assert body["lots"][0]["classification"] == "PEÇA_SOLTEIRA"

    invalid = client.post(
        "/api/v1/analysis/preview",
        json={"inventory": {"id": str(uuid4()), "date": "2026-09-11", "revision": 1}, "entries": [
            {"id": str(uuid4()), "side": "EF", "bay": "1", "lot": "L", "quantity": 0}
        ]},
    )
    assert invalid.status_code == 422
