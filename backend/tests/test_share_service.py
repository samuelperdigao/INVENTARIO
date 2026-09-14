from datetime import datetime, timezone

from app.config import get_settings
from app.share_service import (
    SHARE_LINK_TTL,
    create_export_share_signature,
    validate_export_share_signature,
)


def test_signed_export_link_is_valid_for_expected_resource(monkeypatch):
    monkeypatch.setenv("INVENTORY_AUTH_SECRET", "a" * 40)
    settings = get_settings()

    expires, signature = create_export_share_signature(
        settings,
        inventory_id="inventory-123",
        format_name="xlsx",
    )

    remaining = expires - int(datetime.now(timezone.utc).timestamp())
    assert int(SHARE_LINK_TTL.total_seconds()) - 5 <= remaining <= int(SHARE_LINK_TTL.total_seconds())
    assert validate_export_share_signature(
        settings,
        inventory_id="inventory-123",
        format_name="xlsx",
        expires=expires,
        signature=signature,
    )


def test_signed_export_link_rejects_tampering(monkeypatch):
    monkeypatch.setenv("INVENTORY_AUTH_SECRET", "b" * 40)
    settings = get_settings()

    expires, signature = create_export_share_signature(
        settings,
        inventory_id="inventory-123",
        format_name="docx",
    )

    assert not validate_export_share_signature(
        settings,
        inventory_id="inventory-999",
        format_name="docx",
        expires=expires,
        signature=signature,
    )
    assert not validate_export_share_signature(
        settings,
        inventory_id="inventory-123",
        format_name="xlsx",
        expires=expires,
        signature=signature,
    )
