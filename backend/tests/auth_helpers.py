from fastapi.testclient import TestClient


def register_verified(client: TestClient, email: str, team_name: str | None = None) -> tuple[dict[str, object], dict[str, str]]:
    registered = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "senha-segura-123", "displayName": email.split("@")[0]},
    )
    assert registered.status_code == 202
    logged_in = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "senha-segura-123"},
    )
    assert logged_in.status_code == 200
    body = logged_in.json()
    auth = {"Authorization": f"Bearer {body['accessToken']}"}
    if team_name:
        created = client.post("/api/v1/teams", json={"name": team_name}, headers=auth)
        assert created.status_code == 201
        body["user"] = created.json()
    return body, auth
