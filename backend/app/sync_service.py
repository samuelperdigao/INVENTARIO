"""Aplicação de alterações idempotentes e leitura incremental da sincronização."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import secrets
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence import (
    InventoryEntryRow,
    InventoryParticipantRow,
    InventoryRow,
    SyncConflictRow,
    SyncEventRow,
    UserRow,
)
from app.schemas import SyncEntry, SyncInventory, SyncRequest

EntityType = Literal["inventory", "entry"]


class SyncAuthorizationError(Exception):
    pass


class SyncNotFoundError(Exception):
    pass


class SyncFinalizedError(Exception):
    pass


class SyncFinalizationRequiredError(Exception):
    pass


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_participation_code(session: Session) -> str:
    for _ in range(50):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if session.scalar(select(InventoryRow.id).where(InventoryRow.participation_code == code)) is None:
            return code
    raise RuntimeError("Não foi possível gerar um código de participação único.")


def _timestamp(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _inventory_record(row: InventoryRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "date": row.date.isoformat(),
        "status": row.status,
        "createdAt": _timestamp(row.created_at),
        "updatedAt": _timestamp(row.updated_at),
        "revision": row.revision,
        "syncBaseRevision": row.revision,
        "tombstone": row.tombstone,
        "deletedAt": _timestamp(row.deleted_at),
    }


def _entry_record(session: Session, row: InventoryEntryRow) -> dict[str, Any]:
    creator = session.get(UserRow, row.created_by_user_id) if row.created_by_user_id else None
    return {
        "id": row.id,
        "inventoryId": row.inventory_id,
        "side": row.side,
        "bay": row.bay,
        "layer": row.layer,
        "lot": row.lot,
        "quantity": row.quantity,
        "createdByUserId": row.created_by_user_id,
        "createdByName": creator.display_name if creator else None,
        "duplicateConfirmed": row.duplicate_confirmed,
        "createdAt": _timestamp(row.created_at),
        "updatedAt": _timestamp(row.updated_at),
        "revision": row.revision,
        "syncBaseRevision": row.revision,
        "tombstone": row.tombstone,
        "deletedAt": _timestamp(row.deleted_at),
    }


def _inventory_matches(row: InventoryRow, incoming: SyncInventory) -> bool:
    return (
        row.date == incoming.date
        and row.status == incoming.status
        and row.tombstone == incoming.tombstone
        and _timestamp(row.deleted_at) == _timestamp(incoming.deletedAt)
    )


def _entry_matches(row: InventoryEntryRow, incoming: SyncEntry) -> bool:
    return (
        row.inventory_id == str(incoming.inventoryId)
        and row.side == incoming.side
        and row.bay == incoming.bay
        and row.layer == incoming.layer
        and row.lot == incoming.lot
        and row.quantity == incoming.quantity
        and row.duplicate_confirmed == incoming.duplicateConfirmed
        and row.tombstone == incoming.tombstone
        and _timestamp(row.deleted_at) == _timestamp(incoming.deletedAt)
        and row.revision == incoming.revision
    )


def _append_event(session: Session, inventory_id: str, entity_type: EntityType, entity_id: str) -> None:
    session.add(SyncEventRow(inventory_id=inventory_id, entity_type=entity_type, entity_id=entity_id))


def _record_conflict(
    session: Session,
    *,
    inventory_id: str,
    entity_type: EntityType,
    entity_id: str,
    device_id: str,
    incoming: SyncInventory | SyncEntry,
    server_record: dict[str, Any],
) -> dict[str, Any]:
    session.add(
        SyncConflictRow(
            id=str(uuid4()),
            inventory_id=inventory_id,
            entity_type=entity_type,
            entity_id=entity_id,
            device_id=device_id,
            incoming_payload=incoming.model_dump(mode="json"),
            server_payload=server_record,
            created_at=datetime.now(timezone.utc),
            resolution="PENDING",
        )
    )
    return {"entityType": entity_type, "entityId": entity_id, "serverRecord": server_record}


def _create_inventory(
    session: Session,
    incoming: SyncInventory,
    sync_token: str,
    team_id: str | None,
    owner_user_id: str,
) -> InventoryRow:
    row = InventoryRow(
        id=str(incoming.id),
        date=incoming.date,
        status=incoming.status,
        created_at=incoming.createdAt,
        updated_at=incoming.updatedAt,
        revision=incoming.revision,
        tombstone=incoming.tombstone,
        deleted_at=incoming.deletedAt,
        sync_token_hash=_hash_token(sync_token),
        team_id=team_id,
        owner_user_id=owner_user_id,
        participation_code=_new_participation_code(session),
        finalized_by_user_id=None,
    )
    session.add(row)
    session.flush()
    _append_event(session, row.id, "inventory", row.id)
    return row


def _apply_inventory(
    session: Session,
    row: InventoryRow,
    incoming: SyncInventory,
    device_id: str,
) -> tuple[bool, dict[str, Any] | None]:
    if _inventory_matches(row, incoming):
        return True, None
    if incoming.syncBaseRevision == row.revision and incoming.revision > row.revision:
        row.date = incoming.date
        row.status = incoming.status
        row.updated_at = incoming.updatedAt
        row.revision = incoming.revision
        row.tombstone = incoming.tombstone
        row.deleted_at = incoming.deletedAt
        _append_event(session, row.id, "inventory", row.id)
        return True, None
    return False, _record_conflict(
        session,
        inventory_id=row.id,
        entity_type="inventory",
        entity_id=row.id,
        device_id=device_id,
        incoming=incoming,
        server_record=_inventory_record(row),
    )


def _create_entry(session: Session, incoming: SyncEntry, actor_user_id: str) -> InventoryEntryRow:
    row = InventoryEntryRow(
        id=str(incoming.id),
        inventory_id=str(incoming.inventoryId),
        side=incoming.side,
        bay=incoming.bay,
        layer=incoming.layer,
        lot=incoming.lot,
        quantity=incoming.quantity,
        created_by_user_id=actor_user_id,
        duplicate_confirmed=incoming.duplicateConfirmed,
        created_at=incoming.createdAt,
        updated_at=incoming.updatedAt,
        revision=incoming.revision,
        tombstone=incoming.tombstone,
        deleted_at=incoming.deletedAt,
    )
    session.add(row)
    session.flush()
    _append_event(session, row.inventory_id, "entry", row.id)
    return row


def _apply_entry(
    session: Session,
    row: InventoryEntryRow,
    incoming: SyncEntry,
    device_id: str,
) -> tuple[bool, dict[str, Any] | None]:
    if _entry_matches(row, incoming):
        return True, None
    if incoming.syncBaseRevision == row.revision and incoming.revision > row.revision:
        row.side = incoming.side
        row.bay = incoming.bay
        row.layer = incoming.layer
        row.lot = incoming.lot
        row.quantity = incoming.quantity
        row.duplicate_confirmed = incoming.duplicateConfirmed
        row.updated_at = incoming.updatedAt
        row.revision = incoming.revision
        row.tombstone = incoming.tombstone
        row.deleted_at = incoming.deletedAt
        _append_event(session, row.inventory_id, "entry", row.id)
        return True, None
    return False, _record_conflict(
        session,
        inventory_id=row.inventory_id,
        entity_type="entry",
        entity_id=row.id,
        device_id=device_id,
        incoming=incoming,
        server_record=_entry_record(session, row),
    )


def synchronize(session: Session, payload: SyncRequest, sync_token: str, *, team_id: str | None, actor_user_id: str) -> dict[str, Any]:
    """Aplica apenas alterações pendentes e devolve alterações desde o cursor.

    A igualdade de revisão torna repetição segura. Um ``syncBaseRevision`` que
    não corresponda à revisão central vira conflito explícito e auditável.
    """

    inventory_id = str(payload.inventoryId)
    if payload.inventory is not None and payload.inventory.status != "OPEN":
        raise SyncFinalizationRequiredError()
    inventory = session.get(InventoryRow, inventory_id)
    if inventory is None:
        if payload.inventory is None:
            raise SyncNotFoundError()
        inventory = _create_inventory(session, payload.inventory, sync_token, team_id, actor_user_id)
        acknowledged_inventory = True
    else:
        participant = session.scalar(
            select(InventoryParticipantRow).where(
                InventoryParticipantRow.inventory_id == inventory.id,
                InventoryParticipantRow.user_id == actor_user_id,
            )
        )
        owner_access = inventory.owner_user_id == actor_user_id
        team_access = inventory.team_id == team_id and team_id is not None
        participant_access = participant is not None and hmac.compare_digest(participant.access_token_hash, _hash_token(sync_token))
        if not owner_access and not team_access and not participant_access:
            raise SyncNotFoundError()
        if (owner_access or team_access) and not hmac.compare_digest(inventory.sync_token_hash, _hash_token(sync_token)):
            raise SyncAuthorizationError()
        if participant_access and participant is not None:
            participant.last_accessed_at = datetime.now(timezone.utc)
        if inventory.status == "OPEN" and inventory.participation_code is None:
            inventory.participation_code = _new_participation_code(session)
        acknowledged_inventory = False

    if inventory.status == "FINISHED" and (payload.inventory is not None or payload.entries):
        raise SyncFinalizedError()

    acknowledged_entry_ids: list[str] = []
    conflicts: list[dict[str, Any]] = []
    if payload.inventory is not None and inventory.id == str(payload.inventory.id) and not acknowledged_inventory:
        acknowledged_inventory, conflict = _apply_inventory(session, inventory, payload.inventory, str(payload.deviceId))
        if conflict:
            conflicts.append(conflict)

    for incoming in payload.entries:
        row = session.get(InventoryEntryRow, str(incoming.id))
        if row is None:
            if incoming.syncBaseRevision != 0:
                conflicts.append(
                    _record_conflict(
                        session,
                        inventory_id=inventory.id,
                        entity_type="entry",
                        entity_id=str(incoming.id),
                        device_id=str(payload.deviceId),
                        incoming=incoming,
                        server_record={},
                    )
                )
                continue
            _create_entry(session, incoming, actor_user_id)
            acknowledged_entry_ids.append(str(incoming.id))
            continue
        if row.inventory_id != inventory.id:
            conflicts.append(
                _record_conflict(
                    session,
                    inventory_id=inventory.id,
                    entity_type="entry",
                    entity_id=row.id,
                    device_id=str(payload.deviceId),
                    incoming=incoming,
                    server_record=_entry_record(session, row),
                )
            )
            continue
        acknowledged, conflict = _apply_entry(session, row, incoming, str(payload.deviceId))
        if acknowledged:
            acknowledged_entry_ids.append(row.id)
        elif conflict:
            conflicts.append(conflict)

    session.flush()
    events = session.scalars(
        select(SyncEventRow)
        .where(SyncEventRow.inventory_id == inventory.id, SyncEventRow.sequence > payload.cursor)
        .order_by(SyncEventRow.sequence)
        .limit(1_000)
    ).all()
    latest_events: dict[tuple[str, str], SyncEventRow] = {}
    for event in events:
        latest_events[(event.entity_type, event.entity_id)] = event

    returned_inventory: dict[str, Any] | None = _inventory_record(inventory)
    returned_entries: list[dict[str, Any]] = []
    for (entity_type, entity_id), _event in latest_events.items():
        if entity_type == "inventory":
            continue
        row = session.get(InventoryEntryRow, entity_id)
        if row is not None:
            returned_entries.append(_entry_record(session, row))

    session.commit()
    return {
        "cursor": events[-1].sequence if events else payload.cursor,
        "inventory": returned_inventory,
        "entries": returned_entries,
        "acknowledged": {"inventory": acknowledged_inventory, "entryIds": acknowledged_entry_ids},
        "conflicts": conflicts,
        "participationCode": inventory.participation_code if inventory.status == "OPEN" else None,
    }
