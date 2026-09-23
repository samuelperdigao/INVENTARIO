"""API administrativa global; cada leitura e alteração verifica a permissão no banco."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime
import hashlib
import hmac
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import Field, StrictInt
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session

from app.admin_service import (
    audit, current_report, entry_snapshot, lock_inventory, now_utc,
    refresh_official_report, touch_inventory,
)
from app.config import get_settings
from app.database import get_session
from app.lot_rules import LotNumber
from app.persistence import (
    AdminAuditRow, AdminReportVersionRow, InventoryEntryRow, InventoryParticipantRow,
    InventoryRow, ReferenceLotRow, SystemAdminRow, UserRow,
)
from app.reference_service import (
    active_reference, reference_lot_numbers, reference_metadata, reference_state,
    remove_reference, replace_reference,
)
from app.schemas import ApiModel, Layer
from app.sync_service import _append_event, _entry_record, _hash_token, _inventory_record

# O módulo é carregado após a definição das dependências e exportadores em main.py.
from app.main import get_current_user, _export_response, _parse_reference_upload, _read_reference_upload


router = APIRouter(prefix="/api/v1/admin", tags=["administração"])
assigned_router = APIRouter(tags=["inventários atribuídos"])


def require_admin(
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRow:
    if session.get(SystemAdminRow, user.id) is None:
        raise HTTPException(status_code=403, detail="Acesso administrativo não autorizado.")
    return user


class RevisionRequest(ApiModel):
    expectedRevision: StrictInt = Field(ge=1)
    expectedGeneration: StrictInt = Field(ge=1)
    reason: str | None = Field(default=None, max_length=1000)


class ExplainedRequest(RevisionRequest):
    reason: str = Field(min_length=8, max_length=1000)


class DeleteRequest(ExplainedRequest):
    confirmation: Literal["EXCLUIR INVENTÁRIO"]


class TransferRequest(ExplainedRequest):
    newOwnerUserId: str = Field(min_length=36, max_length=36)


class EntryInput(RevisionRequest):
    side: Literal["DE", "EF"]
    bay: str = Field(min_length=1, max_length=100)
    layer: Layer | None = None
    lot: LotNumber
    quantity: StrictInt = Field(gt=0)
    duplicateConfirmed: bool = False


def _visible_item(session: Session, inventory: InventoryRow) -> dict:
    owner = session.get(UserRow, inventory.owner_user_id) if inventory.owner_user_id else None
    records, pieces, lots = session.execute(
        select(func.count(InventoryEntryRow.id), func.coalesce(func.sum(InventoryEntryRow.quantity), 0),
               func.count(func.distinct(InventoryEntryRow.lot)))
        .where(InventoryEntryRow.inventory_id == inventory.id, InventoryEntryRow.tombstone.is_(False))
    ).one()
    return {
        **_inventory_record(inventory), "ownerName": owner.display_name if owner else None,
        "ownerEmail": owner.email if owner else None, "ownerUserId": inventory.owner_user_id,
        "recordCount": int(records), "lotCount": int(lots), "pieceCount": int(pieces),
        "reportVersion": inventory.report_version,
        "finalizedAt": inventory.finalized_at.isoformat() if inventory.finalized_at else None,
    }


def _detail(session: Session, inventory: InventoryRow, page: int = 1, page_size: int = 100) -> dict:
    statement = select(InventoryEntryRow).where(InventoryEntryRow.inventory_id == inventory.id)
    total = int(session.scalar(select(func.count()).select_from(InventoryEntryRow).where(
        InventoryEntryRow.inventory_id == inventory.id, InventoryEntryRow.tombstone.is_(False),
    )) or 0)
    entries = session.scalars(statement.where(InventoryEntryRow.tombstone.is_(False))
        .order_by(InventoryEntryRow.created_at, InventoryEntryRow.id)
        .offset((page - 1) * page_size).limit(page_size)).all()
    participants = session.execute(
        select(UserRow.display_name, UserRow.email)
        .join(InventoryParticipantRow, InventoryParticipantRow.user_id == UserRow.id)
        .where(InventoryParticipantRow.inventory_id == inventory.id)
    ).all()
    return {
        **_visible_item(session, inventory),
        "entries": [_entry_record(session, entry) for entry in entries],
        "entryTotal": total, "entryPage": page, "entryPageSize": page_size,
        "participants": [{"name": name, "email": email} for name, email in participants],
        "reference": reference_state(session, inventory.id, page=1, page_size=50),
    }


def _history_item(session: Session, row: AdminAuditRow) -> dict:
    actor = session.get(UserRow, row.actor_user_id)
    return {
        "id": row.id, "inventoryId": row.inventory_id, "entryId": row.entry_id,
        "actorName": actor.display_name if actor else "Administrador",
        "action": row.action, "reason": row.reason,
        "before": row.before, "after": row.after,
        "inventoryRevision": row.inventory_revision,
        "operationalGeneration": row.operational_generation,
        "reportVersion": row.report_version, "createdAt": row.created_at.isoformat(),
    }


def _owner_token(inventory: InventoryRow, user_id: str) -> str:
    message = f"owner:{inventory.id}:{user_id}"
    return hmac.new(get_settings().auth_secret.encode(), message.encode(), hashlib.sha256).hexdigest()


@assigned_router.get("/api/v1/inventories/assigned")
def assigned_inventories(
    user: UserRow = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, str]]:
    inventories = session.scalars(select(InventoryRow).where(
        InventoryRow.owner_user_id == user.id, InventoryRow.tombstone.is_(False),
        InventoryRow.owner_access_hash.is_not(None),
    )).all()
    return [
        {"inventoryId": inventory.id, "date": inventory.date.isoformat(),
         "status": inventory.status, "accessToken": _owner_token(inventory, user.id)}
        for inventory in inventories
        if hmac.compare_digest(inventory.owner_access_hash, _hash_token(_owner_token(inventory, user.id)))
    ]


@router.get("/overview")
def overview(
    date_from: date | None = Query(default=None, alias="dateFrom"),
    date_to: date | None = Query(default=None, alias="dateTo"),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="O período final deve ser posterior ao inicial.")
    statement = select(InventoryRow).where(InventoryRow.tombstone.is_(False))
    if date_from:
        statement = statement.where(InventoryRow.date >= date_from)
    if date_to:
        statement = statement.where(InventoryRow.date <= date_to)
    inventories = session.scalars(statement.order_by(InventoryRow.created_at.desc())).all()
    ids = [inventory.id for inventory in inventories]
    if ids:
        entry_stats = session.execute(select(
            func.count(func.distinct(InventoryEntryRow.lot)),
            func.coalesce(func.sum(InventoryEntryRow.quantity), 0),
        ).where(InventoryEntryRow.inventory_id.in_(ids), InventoryEntryRow.tombstone.is_(False))).one()
    else:
        entry_stats = (0, 0)
    periods = Counter(inventory.date.strftime("%Y-%m") for inventory in inventories)
    recent_activities = session.scalars(
        select(AdminAuditRow).order_by(AdminAuditRow.created_at.desc()).limit(10)
    ).all()
    return {
        "total": len(inventories),
        "open": sum(inventory.status == "OPEN" for inventory in inventories),
        "finished": sum(inventory.status == "FINISHED" for inventory in inventories),
        "lots": int(entry_stats[0]), "pieces": int(entry_stats[1]),
        "byPeriod": [{"period": period, "count": count} for period, count in sorted(periods.items())],
        "recent": [_visible_item(session, inventory) for inventory in inventories[:8]],
        "activities": [_history_item(session, row) for row in recent_activities],
    }


@router.get("/inventories")
def list_inventories(
    query: str = Query(default="", max_length=120),
    status: Literal["OPEN", "FINISHED"] | None = None,
    deleted: bool = False,
    owner_id: str | None = Query(default=None, alias="ownerId"),
    date_from: date | None = Query(default=None, alias="dateFrom"),
    date_to: date | None = Query(default=None, alias="dateTo"),
    order: Literal["recent", "oldest", "date", "dateAsc"] = "recent",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100, alias="pageSize"),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="O período final deve ser posterior ao inicial.")
    statement = select(InventoryRow).where(InventoryRow.tombstone.is_(deleted))
    if status:
        statement = statement.where(InventoryRow.status == status)
    if owner_id:
        statement = statement.where(InventoryRow.owner_user_id == owner_id)
    if date_from:
        statement = statement.where(InventoryRow.date >= date_from)
    if date_to:
        statement = statement.where(InventoryRow.date <= date_to)
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.outerjoin(UserRow, UserRow.id == InventoryRow.owner_user_id).where(or_(
            InventoryRow.id.ilike(pattern), UserRow.display_name.ilike(pattern),
            UserRow.email.ilike(pattern), InventoryRow.date.cast(String).ilike(pattern),
            select(InventoryEntryRow.id).where(
                InventoryEntryRow.inventory_id == InventoryRow.id,
                InventoryEntryRow.lot.ilike(pattern),
            ).exists(),
        ))
    count = int(session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    ordering = {
        "recent": InventoryRow.created_at.desc(),
        "oldest": InventoryRow.created_at.asc(),
        "date": InventoryRow.date.desc(),
        "dateAsc": InventoryRow.date.asc(),
    }[order]
    inventories = session.scalars(statement.order_by(ordering, InventoryRow.id)
        .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_visible_item(session, item) for item in inventories], "total": count,
            "page": page, "pageSize": page_size}


@router.get("/users")
def list_users(
    query: str = Query(default="", max_length=120),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[dict]:
    statement = select(UserRow).order_by(UserRow.display_name).limit(30)
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(or_(UserRow.display_name.ilike(pattern), UserRow.email.ilike(pattern)))
    return [{"id": user.id, "name": user.display_name, "email": user.email} for user in session.scalars(statement)]


@router.get("/audit")
def list_audit(
    inventory_id: str | None = Query(default=None, alias="inventoryId"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100, alias="pageSize"),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    statement = select(AdminAuditRow)
    if inventory_id:
        statement = statement.where(AdminAuditRow.inventory_id == inventory_id)
    total = int(session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    rows = session.scalars(statement.order_by(AdminAuditRow.created_at.desc(), AdminAuditRow.id.desc())
        .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_history_item(session, row) for row in rows], "total": total}


@router.get("/inventories/{inventory_id}")
def inventory_detail(
    inventory_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200, alias="pageSize"),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    inventory = session.get(InventoryRow, inventory_id)
    if inventory is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    return _detail(session, inventory, page, page_size)


@router.get("/inventories/{inventory_id}/versions")
def report_versions(
    inventory_id: str, _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[dict]:
    if session.get(InventoryRow, inventory_id) is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    rows = session.scalars(select(AdminReportVersionRow).where(
        AdminReportVersionRow.inventory_id == inventory_id
    ).order_by(AdminReportVersionRow.version.desc())).all()
    return [{"version": row.version, "createdAt": row.created_at.isoformat(),
             "revision": row.inventory_revision, "operationalGeneration": row.operational_generation}
            for row in rows]


def _version(session: Session, inventory_id: str, version: int) -> AdminReportVersionRow:
    row = session.scalar(select(AdminReportVersionRow).where(
        AdminReportVersionRow.inventory_id == inventory_id,
        AdminReportVersionRow.version == version,
    ))
    if row is None:
        raise HTTPException(status_code=404, detail="Versão do relatório não encontrada.")
    return row


@router.get("/inventories/{inventory_id}/versions/{version}")
def version_report(
    inventory_id: str, version: int, _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    return _version(session, inventory_id, version).snapshot


@router.get("/inventories/{inventory_id}/export/{format_name}")
def admin_export(
    inventory_id: str, format_name: Literal["xls", "xlsx", "pdf", "docx"],
    version: int | None = Query(default=None, ge=1),
    _admin: UserRow = Depends(require_admin),
    session: Session = Depends(get_session),
):
    inventory = session.get(InventoryRow, inventory_id)
    if inventory is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    if version is not None:
        report = _version(session, inventory_id, version).snapshot
    elif inventory.status == "FINISHED" and inventory.report_snapshot:
        report = inventory.report_snapshot
    else:
        report = current_report(session, inventory, now_utc())
    return _export_response(report, format_name)


def _entry_change(
    session: Session, inventory: InventoryRow, actor: UserRow, payload: EntryInput,
    entry: InventoryEntryRow | None = None,
) -> InventoryEntryRow:
    bay = payload.bay.strip()
    if not bay:
        raise HTTPException(status_code=422, detail="Informe o vão.")
    if not payload.duplicateConfirmed:
        duplicate = select(InventoryEntryRow.id).where(
            InventoryEntryRow.inventory_id == inventory.id,
            InventoryEntryRow.lot == str(payload.lot),
            InventoryEntryRow.tombstone.is_(False),
        )
        if entry is not None:
            duplicate = duplicate.where(InventoryEntryRow.id != entry.id)
        if session.scalar(duplicate) is not None:
            raise HTTPException(status_code=409, detail="Este lote já possui lançamento neste inventário. Confirme a duplicidade para continuar.")
    when = now_utc()
    previous = entry_snapshot(session, entry) if entry else None
    if entry is None:
        entry = InventoryEntryRow(
            id=str(uuid4()), inventory_id=inventory.id, created_by_user_id=actor.id,
            created_at=when, revision=1, tombstone=False, deleted_at=None,
            operational_generation=inventory.operational_generation,
        )
        session.add(entry)
    else:
        entry.revision += 1
    entry.side, entry.bay, entry.layer = payload.side, bay, payload.layer
    entry.lot, entry.quantity = str(payload.lot), payload.quantity
    entry.duplicate_confirmed = payload.duplicateConfirmed
    entry.updated_at = when
    session.flush()
    _append_event(session, inventory.id, "entry", entry.id)
    touch_inventory(session, inventory, when)
    session.flush()
    refresh_official_report(session, inventory, when)
    audit(session, inventory, actor.id, "ENTRY_CREATED" if previous is None else "ENTRY_UPDATED",
          reason=payload.reason, before=previous, after=entry_snapshot(session, entry), entry_id=entry.id)
    return entry


@router.post("/inventories/{inventory_id}/entries")
def create_entry(
    inventory_id: str, payload: EntryInput,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    if inventory.status == "FINISHED" and (not payload.reason or len(payload.reason.strip()) < 8):
        raise HTTPException(status_code=422, detail="Informe uma justificativa para corrigir um inventário finalizado.")
    entry = _entry_change(session, inventory, admin, payload)
    session.commit()
    return {"entry": _entry_record(session, entry), "inventory": _detail(session, inventory)}


@router.post("/inventories/{inventory_id}/entries/{entry_id}")
def update_entry(
    inventory_id: str, entry_id: str, payload: EntryInput,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    if inventory.status == "FINISHED" and (not payload.reason or len(payload.reason.strip()) < 8):
        raise HTTPException(status_code=422, detail="Informe uma justificativa para corrigir um inventário finalizado.")
    entry = session.get(InventoryEntryRow, entry_id)
    if entry is None or entry.inventory_id != inventory_id or entry.tombstone:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    _entry_change(session, inventory, admin, payload, entry)
    session.commit()
    return _detail(session, inventory)


@router.post("/inventories/{inventory_id}/entries/{entry_id}/remove")
def remove_entry(
    inventory_id: str, entry_id: str, payload: RevisionRequest,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    if inventory.status == "FINISHED" and (not payload.reason or len(payload.reason.strip()) < 8):
        raise HTTPException(status_code=422, detail="Informe uma justificativa para corrigir um inventário finalizado.")
    entry = session.get(InventoryEntryRow, entry_id)
    if entry is None or entry.inventory_id != inventory_id or entry.tombstone:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    before = entry_snapshot(session, entry)
    when = now_utc()
    entry.tombstone, entry.deleted_at, entry.updated_at = True, when, when
    entry.revision += 1
    _append_event(session, inventory.id, "entry", entry.id)
    touch_inventory(session, inventory, when)
    session.flush()
    refresh_official_report(session, inventory, when)
    audit(session, inventory, admin.id, "ENTRY_REMOVED", reason=payload.reason,
          before=before, after=entry_snapshot(session, entry), entry_id=entry.id)
    session.commit()
    return _detail(session, inventory)


@router.post("/inventories/{inventory_id}/reopen")
def reopen_inventory(
    inventory_id: str, payload: ExplainedRequest,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    if inventory.status != "FINISHED":
        raise HTTPException(status_code=409, detail="Este inventário já está aberto.")
    before = _visible_item(session, inventory)
    when = now_utc()
    inventory.operational_generation += 1
    inventory.status, inventory.report_snapshot = "OPEN", None
    inventory.finalized_at, inventory.finalized_by_user_id = None, None
    inventory.participation_code = None  # Novo código é emitido no próximo sync autorizado.
    touch_inventory(session, inventory, when)
    entries = session.scalars(select(InventoryEntryRow).where(InventoryEntryRow.inventory_id == inventory.id)).all()
    for entry in entries:
        entry.operational_generation = inventory.operational_generation
        entry.revision += 1
        entry.updated_at = when
        _append_event(session, inventory.id, "entry", entry.id)
    audit(session, inventory, admin.id, "REOPENED", reason=payload.reason,
          before=before, after={"status": "OPEN", "operationalGeneration": inventory.operational_generation})
    session.commit()
    return _detail(session, inventory)


@router.post("/inventories/{inventory_id}/delete")
def delete_inventory(
    inventory_id: str, payload: DeleteRequest,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    before = _visible_item(session, inventory)
    when = now_utc()
    inventory.tombstone, inventory.deleted_at = True, when
    inventory.participation_code = None
    touch_inventory(session, inventory, when)
    audit(session, inventory, admin.id, "INVENTORY_DELETED", reason=payload.reason,
          before=before, after={"tombstone": True, "deletedAt": when.isoformat()})
    session.commit()
    return _detail(session, inventory)


@router.post("/inventories/{inventory_id}/transfer")
def transfer_owner(
    inventory_id: str, payload: TransferRequest,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    owner = session.get(UserRow, payload.newOwnerUserId)
    if owner is None:
        raise HTTPException(status_code=404, detail="Novo responsável não encontrado.")
    if inventory.owner_user_id == owner.id:
        raise HTTPException(status_code=409, detail="Esta pessoa já é responsável pelo inventário.")
    before = {"ownerUserId": inventory.owner_user_id}
    inventory.owner_user_id = owner.id
    inventory.owner_access_hash = _hash_token(_owner_token(inventory, owner.id))
    touch_inventory(session, inventory, now_utc())
    audit(session, inventory, admin.id, "OWNER_TRANSFERRED", reason=payload.reason,
          before=before, after={"ownerUserId": owner.id, "ownerName": owner.display_name})
    session.commit()
    return _detail(session, inventory)


@router.get("/inventories/{inventory_id}/reference")
def admin_reference(
    inventory_id: str, query: str = Query(default="", max_length=80),
    page: int = Query(default=1, ge=1),
    _admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    if session.get(InventoryRow, inventory_id) is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    state = reference_state(session, inventory_id, page=page, page_size=50, query=query)
    reference = active_reference(session, inventory_id)
    if reference:
        statement = select(InventoryEntryRow.lot, func.sum(InventoryEntryRow.quantity)).where(
            InventoryEntryRow.inventory_id == inventory_id, InventoryEntryRow.tombstone.is_(False),
            ~InventoryEntryRow.lot.in_(select(ReferenceLotRow.lot_number).where(ReferenceLotRow.reference_id == reference.id)),
        )
        if query.strip():
            statement = statement.where(InventoryEntryRow.lot.like(f"%{query.strip()}%"))
        outside = session.execute(statement.group_by(InventoryEntryRow.lot).order_by(InventoryEntryRow.lot).limit(100)).all()
        state["outsideLots"] = [{"lotNumber": lot, "physicalQuantity": int(quantity)} for lot, quantity in outside]
    else:
        state["outsideLots"] = []
    return state


@router.post("/inventories/{inventory_id}/reference/preview")
async def admin_reference_preview(
    inventory_id: str, file: UploadFile = File(...),
    column_index: int | None = Form(default=None, alias="columnIndex"),
    _admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    if session.get(InventoryRow, inventory_id) is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    filename, content = await _read_reference_upload(file)
    return _parse_reference_upload(content, filename, column_index).preview_payload()


@router.post("/inventories/{inventory_id}/reference")
async def admin_import_reference(
    inventory_id: str, file: UploadFile = File(...),
    expected_revision: int = Form(alias="expectedRevision"),
    expected_generation: int = Form(alias="expectedGeneration"),
    reason: str = Form(min_length=8),
    column_index: int | None = Form(default=None, alias="columnIndex"),
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    filename, content = await _read_reference_upload(file)
    parsed = _parse_reference_upload(content, filename, column_index)
    if not parsed.lots:
        raise HTTPException(status_code=422, detail="Nenhum lote válido encontrado na coluna Lotes.")
    inventory = lock_inventory(session, inventory_id, expected_revision, expected_generation)
    previous = active_reference(session, inventory.id)
    before = {"metadata": reference_metadata(session, previous),
              "lotNumbers": list(reference_lot_numbers(session, previous.id))} if previous else None
    reference = replace_reference(session, inventory_id=inventory.id, filename=parsed.original_filename,
                                  lots=parsed.lots, user_id=admin.id)
    when = now_utc()
    touch_inventory(session, inventory, when)
    session.flush()
    refresh_official_report(session, inventory, when)
    audit(session, inventory, admin.id, "REFERENCE_IMPORTED", reason=reason, before=before,
          after={"metadata": reference_metadata(session, reference), "lotNumbers": list(parsed.lots)})
    session.commit()
    return _detail(session, inventory)


@router.post("/inventories/{inventory_id}/reference/remove")
def admin_remove_reference(
    inventory_id: str, payload: ExplainedRequest,
    admin: UserRow = Depends(require_admin), session: Session = Depends(get_session),
) -> dict:
    inventory = lock_inventory(session, inventory_id, payload.expectedRevision, payload.expectedGeneration)
    reference = active_reference(session, inventory.id)
    if reference is None:
        raise HTTPException(status_code=404, detail="Não há referência ativa.")
    before = {"metadata": reference_metadata(session, reference),
              "lotNumbers": list(reference_lot_numbers(session, reference.id))}
    remove_reference(session, inventory.id)
    when = now_utc()
    touch_inventory(session, inventory, when)
    session.flush()
    refresh_official_report(session, inventory, when)
    audit(session, inventory, admin.id, "REFERENCE_REMOVED", reason=payload.reason, before=before)
    session.commit()
    return _detail(session, inventory)
