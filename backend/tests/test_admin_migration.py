from datetime import date, datetime, timezone
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, table, column, String, Date, DateTime, Integer, Boolean, JSON


def test_migration_preserves_finished_report_as_first_immutable_version(tmp_path, monkeypatch) -> None:
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    monkeypatch.setenv("INVENTORY_DATABASE_URL", url)
    config = Config("backend/alembic.ini")
    command.upgrade(config, "0008_inventory_lot_references")

    engine = create_engine(url)
    inventory_id = str(uuid4())
    timestamp = datetime.now(timezone.utc)
    original = {"inventoryId": inventory_id, "inventoryDate": "2026-09-23",
                "revision": 2, "records": [{"lot": "2712345678", "quantity": 4}], "totalPieces": 4}
    inventories = table(
        "inventories", column("id", String), column("date", Date),
        column("status", String), column("created_at", DateTime(timezone=True)),
        column("updated_at", DateTime(timezone=True)), column("revision", Integer),
        column("tombstone", Boolean), column("deleted_at", DateTime(timezone=True)),
        column("sync_token_hash", String), column("team_id", String),
        column("owner_user_id", String), column("finalized_at", DateTime(timezone=True)),
        column("report_snapshot", JSON),
    )
    with engine.begin() as connection:
        connection.execute(inventories.insert().values(
            id=inventory_id, date=date(2026, 9, 23), status="FINISHED",
            created_at=timestamp, updated_at=timestamp, revision=2, tombstone=False,
            deleted_at=None, sync_token_hash="a" * 64, team_id=None, owner_user_id=None,
            finalized_at=timestamp, report_snapshot=original,
        ))
    command.upgrade(config, "head")

    versions = table("admin_report_versions", column("inventory_id", String),
                     column("version", Integer), column("snapshot", JSON))
    updated = table("inventories", column("id", String), column("report_version", Integer),
                    column("operational_generation", Integer))
    with engine.connect() as connection:
        row = connection.execute(select(versions.c.version, versions.c.snapshot).where(
            versions.c.inventory_id == inventory_id,
        )).one()
        assert row.version == 1 and row.snapshot == original
        version, generation = connection.execute(select(
            updated.c.report_version, updated.c.operational_generation,
        ).where(updated.c.id == inventory_id)).one()
        assert (version, generation) == (1, 1)
    engine.dispose()
