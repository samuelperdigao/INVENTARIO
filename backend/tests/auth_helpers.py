import re

from fastapi.testclient import TestClient

from app.email_service import development_outbox


def register_verified(client: TestClient, email: str, team_name: str | None = None) -> tuple[dict[str, object], dict[str, str]]:
    registered = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "senha-segura-123", "displayName": email.split("@")[0]},
    )
    assert registered.status_code == 202
    code_match = re.search(r"\b(\d{6})\b", development_outbox[-1].text)
    assert code_match
    verified = client.post("/api/v1/auth/verify-email", json={"email": email, "code": code_match.group(1)})
    assert verified.status_code == 200
    body = verified.json()
    auth = {"Authorization": f"Bearer {body['accessToken']}"}
    if team_name:
        created = client.post("/api/v1/teams", json={"name": team_name}, headers=auth)
        assert created.status_code == 201
        body["user"] = created.json()
    return body, auth
