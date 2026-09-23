"""Operações administrativas transacionais e versões oficiais dos relatórios."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engine import AnalysisEntry
from app.persistence import AdminAuditRow, AdminReportVersionRow, InventoryEntryRow, InventoryRow
from app.reference_service import active_reference, reference_lot_numbers, reference_metadata
from app.reports import build_consolidated_report
from app.sync_service import _append_event, _entry_record


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def preserve_report_version(session: Session, inventory: InventoryRow, when: datetime) -> None:
    """Chamado na finalização e em cada correção de inventário finalizado."""
    if inventory.report_snapshot is None:
        raise ValueError("A versão oficial exige um relatório consolidado.")
    inventory.report_version += 1
    session.add(AdminReportVersionRow(
        id=str(uuid4()), inventory_id=inventory.id, version=inventory.report_version,
        operational_generation=inventory.operational_generation,
        inventory_revision=inventory.revision,
        snapshot=inventory.report_snapshot, created_at=when,
    ))


def lock_inventory(session: Session, inventory_id: str, revision: int, generation: int) -> InventoryRow:
    inventory = session.scalar(
        select(InventoryRow).where(InventoryRow.id == inventory_id)
        .with_for_update().execution_options(populate_existing=True)
    )
    if inventory is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    if inventory.revision != revision or inventory.operational_generation != generation:
        raise HTTPException(status_code=409, detail="O inventário foi alterado. Atualize os dados antes de continuar.")
    if inventory.tombstone:
        raise HTTPException(status_code=409, detail="Inventário excluído. Consulte o histórico administrativo.")
    return inventory


def touch_inventory(session: Session, inventory: InventoryRow, when: datetime) -> None:
    inventory.revision += 1
    inventory.updated_at = when
    _append_event(session, inventory.id, "inventory", inventory.id)


def current_report(session: Session, inventory: InventoryRow, when: datetime) -> dict:
    entries = session.scalars(select(InventoryEntryRow).where(
        InventoryEntryRow.inventory_id == inventory.id, InventoryEntryRow.tombstone.is_(False),
    )).all()
    reference = active_reference(session, inventory.id)
    return build_consolidated_report(
        inventory.id, inventory.date.isoformat(), inventory.revision,
        (AnalysisEntry(side=row.side, bay=row.bay, layer=row.layer, lot=row.lot, quantity=row.quantity) for row in entries),
        when,
        reference_lots=reference_lot_numbers(session, reference.id) if reference else None,
        reference_metadata=reference_metadata(session, reference) if reference else None,
    )


def refresh_official_report(session: Session, inventory: InventoryRow, when: datetime) -> None:
    if inventory.status == "FINISHED":
        inventory.report_snapshot = current_report(session, inventory, when)
        preserve_report_version(session, inventory, when)


def audit(
    session: Session, inventory: InventoryRow, actor_id: str, action: str,
    *, reason: str | None = None, before: dict | None = None,
    after: dict | None = None, entry_id: str | None = None,
) -> None:
    session.add(AdminAuditRow(
        id=str(uuid4()), inventory_id=inventory.id, entry_id=entry_id,
        actor_user_id=actor_id, action=action, reason=reason,
        before=before, after=after, inventory_revision=inventory.revision,
        operational_generation=inventory.operational_generation,
        report_version=inventory.report_version, created_at=now_utc(),
    ))


def entry_snapshot(session: Session, entry: InventoryEntryRow) -> dict:
    return _entry_record(session, entry)
