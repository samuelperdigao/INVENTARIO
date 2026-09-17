from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4
import zipfile

import pytest
from docx import Document
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from pypdf import PdfReader
from sqlalchemy import func, select
from xlrd import open_workbook

from app.database import get_session
from app.engine import AnalysisEntry
from app.main import app
from app.persistence import InventoryEntryRow, InventoryReferenceRow, ReferenceLotRow
from app.reference_service import ReferenceImportError, parse_xlsx_reference
from app.reports import build_consolidated_report, export_docx, export_pdf, export_xls, export_xlsx
from auth_helpers import register_verified


client = TestClient(app)


def _xlsx(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    assert worksheet is not None
    for row in rows:
        worksheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _xlsx_with_number_format() -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    assert worksheet is not None
    worksheet.append(["Descrição", "Número do lote"])
    worksheet.append(["Texto", "00123"])
    worksheet.append(["Número", 124])
    worksheet["B3"].number_format = "000000"
    worksheet.append(["Notação", "1,25E+4"])
    worksheet.append(["Duplicado", "00123\u200b"])
    worksheet.append(["Inválido", "abc"])
    worksheet.append(["Vazio", None])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _with_zip_member(content: bytes, name: str) -> bytes:
    output = BytesIO()
    with zipfile.ZipFile(BytesIO(content), "r") as source, zipfile.ZipFile(output, "w") as target:
        for item in source.infolist():
            target.writestr(item, source.read(item.filename))
        target.writestr(name, b"invalid")
    return output.getvalue()


def _times() -> dict[str, str]:
    value = datetime.now(timezone.utc).isoformat()
    return {"createdAt": value, "updatedAt": value}


def _inventory_payload(inventory_id: str) -> dict[str, object]:
    return {
        "id": inventory_id,
        "date": "2026-09-16",
        "status": "OPEN",
        "revision": 1,
        "syncBaseRevision": 0,
        "tombstone": False,
        "deletedAt": None,
        **_times(),
    }


def _entry_payload(inventory_id: str, lot: str, side: str, bay: str, quantity: int) -> dict[str, object]:
    return {
        "id": str(uuid4()),
        "inventoryId": inventory_id,
        "side": side,
        "bay": bay,
        "lot": lot,
        "quantity": quantity,
        "revision": 1,
        "syncBaseRevision": 0,
        "tombstone": False,
        "deletedAt": None,
        **_times(),
    }


def _create_inventory(
    email: str,
    entries: list[dict[str, object]] | None = None,
) -> tuple[str, str, dict[str, str]]:
    _, auth = register_verified(client, email)
    inventory_id = str(uuid4())
    sync_token = f"sync-token-{uuid4()}-{uuid4()}"
    prepared_entries = [{**entry, "inventoryId": inventory_id} for entry in entries or []]
    response = client.post(
        "/api/v1/sync",
        json={
            "deviceId": str(uuid4()),
            "inventoryId": inventory_id,
            "teamId": None,
            "cursor": 0,
            "inventory": _inventory_payload(inventory_id),
            "entries": prepared_entries,
        },
        headers={**auth, "X-Inventory-Sync-Token": sync_token},
    )
    assert response.status_code == 200, response.text
    return inventory_id, sync_token, auth


def _upload(content: bytes, filename: str = "referencia.xlsx") -> dict[str, tuple[str, bytes, str]]:
    return {"file": (filename, content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}


def test_parser_normalizes_text_numbers_scientific_values_and_duplicates() -> None:
    parsed = parse_xlsx_reference(
        _xlsx_with_number_format(),
        r"C:\importacoes\sap\referencia.xlsx",
        max_bytes=2 * 1024 * 1024,
        max_rows=100,
    )

    assert parsed.original_filename == "referencia.xlsx"
    assert parsed.selected_column == 2
    assert parsed.selected_column_label == "Número do lote"
    assert parsed.total_rows == 6
    assert parsed.valid_lot_occurrences == 4
    assert parsed.unique_lots == 3
    assert parsed.duplicate_rows == 1
    assert parsed.ignored_rows == 2
    assert parsed.lots == ("00123", "000124", "12500")
    assert any("caracteres" in warning for warning in parsed.warnings)
    assert any("repetida" in warning for warning in parsed.warnings)


def test_parser_requires_manual_column_when_headers_are_ambiguous() -> None:
    content = _xlsx([["Lote", "Lote SAP"], ["0001", "0002"]])

    preview = parse_xlsx_reference(content, "sap.xlsx", max_bytes=2 * 1024 * 1024, max_rows=100)
    assert preview.requires_column_selection is True
    assert preview.selected_column is None
    assert [column.index for column in preview.columns] == [1, 2]

    selected = parse_xlsx_reference(content, "sap.xlsx", selected_column=2, max_bytes=2 * 1024 * 1024, max_rows=100)
    assert selected.requires_column_selection is False
    assert selected.lots == ("0002",)


def test_parser_rejects_zip_path_traversal() -> None:
    with pytest.raises(ReferenceImportError, match="caminho interno inválido"):
        parse_xlsx_reference(
            _with_zip_member(_xlsx([["Lote"], ["0001"]]), "../escape.txt"),
            "sap.xlsx",
            max_bytes=2 * 1024 * 1024,
            max_rows=100,
        )


def test_reference_preview_import_replace_remove_and_match() -> None:
    inventory_id, sync_token, auth = _create_inventory(
        "referencia.owner@example.com",
        [
            _entry_payload("ignored", "000123", "DE", "15", 19),
            _entry_payload("ignored", "999999", "EF", "21", 1),
        ],
    )

    headers = {**auth, "X-Inventory-Sync-Token": sync_token}
    initial = _xlsx([["Número do lote"], ["000123"], ["000456"]])
    preview = client.post(
        f"/api/v1/inventories/{inventory_id}/reference/preview",
        files=_upload(initial),
        headers=headers,
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["selectedColumn"] == 1
    assert preview.json()["uniqueLots"] == 2

    imported = client.post(
        f"/api/v1/inventories/{inventory_id}/reference",
        files=_upload(initial),
        data={"columnIndex": "1"},
        headers=headers,
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["lotNumbers"] == ["000123", "000456"]
    assert imported.json()["reference"]["totalLots"] == 2

    state = client.get(f"/api/v1/inventories/{inventory_id}/reference", headers=headers)
    assert state.status_code == 200
    assert state.json()["summary"] == {
        "available": True,
        "totalLots": 2,
        "foundLots": 1,
        "pendingLots": 1,
        "outsideReferenceLots": 1,
        "fragmentedLots": 0,
        "physicalDistinctLots": 2,
    }
    assert state.json()["lots"] == [
        {"lotNumber": "000123", "foundPhysically": True, "physicalQuantity": 19, "physicalOccurrences": 1, "fragmented": False},
        {"lotNumber": "000456", "foundPhysically": False, "physicalQuantity": 0, "physicalOccurrences": 0, "fragmented": False},
    ]
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference/match/000123", headers=headers).json()["inReference"] is True
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference/match/999999", headers=headers).json()["inReference"] is False

    replacement = _xlsx([["Número do lote"], ["999999"]])
    replaced = client.post(
        f"/api/v1/inventories/{inventory_id}/reference",
        files=_upload(replacement, "substituicao.xlsx"),
        data={"columnIndex": "1"},
        headers=headers,
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["reference"]["revision"] == 2
    assert replaced.json()["lotNumbers"] == ["999999"]

    replaced_state = client.get(f"/api/v1/inventories/{inventory_id}/reference", headers=headers).json()
    assert replaced_state["summary"]["foundLots"] == 1
    assert replaced_state["summary"]["outsideReferenceLots"] == 1
    assert [item["lotNumber"] for item in replaced_state["lots"]] == ["999999"]

    removed = client.delete(f"/api/v1/inventories/{inventory_id}/reference", headers=headers)
    assert removed.status_code == 200
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference", headers=headers).json()["reference"] is None
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference/match/999999", headers=headers).json() == {
        "referenceAvailable": False,
        "lot": "999999",
        "inReference": None,
    }

    dependency = app.dependency_overrides[get_session]()
    session = next(dependency)
    try:
        assert session.scalar(select(func.count()).select_from(InventoryEntryRow).where(InventoryEntryRow.inventory_id == inventory_id)) == 2
        reference = session.scalar(select(InventoryReferenceRow).where(InventoryReferenceRow.inventory_id == inventory_id))
        assert reference is not None
        assert reference.status == "REMOVED"
        assert session.scalar(select(func.count()).select_from(ReferenceLotRow).where(ReferenceLotRow.reference_id == reference.id)) == 0
    finally:
        dependency.close()


def test_reference_endpoints_do_not_allow_idor() -> None:
    inventory_id, sync_token, owner_auth = _create_inventory("reference.idor.owner@example.com")
    _, attacker_auth = register_verified(client, "reference.idor.attacker@example.com")
    headers = {**attacker_auth, "X-Inventory-Sync-Token": sync_token}
    content = _xlsx([["Lote"], ["000123"]])

    preview = client.post(
        f"/api/v1/inventories/{inventory_id}/reference/preview",
        files=_upload(content),
        headers=headers,
    )
    assert preview.status_code == 404
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference", headers=attacker_auth).status_code == 404
    assert client.delete(f"/api/v1/inventories/{inventory_id}/reference", headers=headers).status_code == 404
    assert client.get(f"/api/v1/inventories/{inventory_id}/reference/match/000123", headers=attacker_auth).status_code == 404
    assert owner_auth["Authorization"] != attacker_auth["Authorization"]


def test_reference_conciliation_reaches_all_report_formats() -> None:
    report = build_consolidated_report(
        str(uuid4()),
        "2026-09-16",
        4,
        [
            # Previsto e encontrado.
            AnalysisEntry(side="DE", bay="15", lot="000123", quantity=19),
            # Físico fora da referência.
            AnalysisEntry(side="EF", bay="21", lot="999999", quantity=1),
        ],
        datetime(2026, 9, 16, tzinfo=timezone.utc),
        reference_lots=("000123", "000456"),
        reference_metadata={
            "sourceType": "SAP_EXCEL",
            "originalFilename": "sap.xlsx",
            "importedAt": "2026-09-16T10:00:00+00:00",
            "updatedAt": "2026-09-16T10:00:00+00:00",
            "revision": 1,
        },
    )

    lots = {lot["lot"]: lot for lot in report["lots"]}  # type: ignore[index]
    assert lots["000123"]["referenceStatus"] == "EXPECTED_FOUND"
    assert lots["000456"]["referenceStatus"] == "EXPECTED_MISSING"
    assert lots["999999"]["referenceStatus"] == "OUTSIDE_REFERENCE"
    assert report["reference"]["missingLots"] == 1  # type: ignore[index]

    xlsx = load_workbook(BytesIO(export_xlsx(report)))
    assert "CONCILIAÇÃO" in xlsx.sheetnames
    xlsx_rows = [xlsx["CONCILIAÇÃO"].cell(row, 1).value for row in range(5, xlsx["CONCILIAÇÃO"].max_row + 1)]
    assert xlsx_rows == ["000123", "000456", "999999"]

    xls = open_workbook(file_contents=export_xls(report))
    conciliation = xls.sheet_by_name("CONCILIAÇÃO")
    assert [conciliation.cell_value(row, 0) for row in range(4, conciliation.nrows)] == ["000123", "000456", "999999"]

    pdf_text = "".join(page.extract_text() or "" for page in PdfReader(BytesIO(export_pdf(report))).pages)
    assert "Conciliação com referência de lotes" in pdf_text
    assert "PREVISTO E NÃO ENCONTRADO" in pdf_text
    assert "FORA DA REFERÊNCIA" in pdf_text

    document = Document(BytesIO(export_docx(report)))
    docx_text = "\n".join(
        [paragraph.text for paragraph in document.paragraphs]
        + [cell.text for table in document.tables for row in table.rows for cell in row.cells]
    )
    assert "Conciliação com referência de lotes" in docx_text
    assert "PREVISTO E NÃO ENCONTRADO" in docx_text
    assert "FORA DA REFERÊNCIA" in docx_text
