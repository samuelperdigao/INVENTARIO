"""Modelo consolidado e exportadores V1.

Os três formatos recebem este mesmo modelo; nenhuma regra de classificação é
reimplementada nos exportadores.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any, Iterable

from docx import Document
from docx.shared import Cm
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.engine import AnalysisEntry, analyze_entries


def _natural_key(value: str) -> list[object]:
    import re
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def _location(location: dict[str, Any] | None) -> str:
    if not location:
        return "—"
    layer = location.get("layer")
    suffix = f" · Camada {layer}" if layer else ""
    return f"{location['side']} · Vão {location['bay']}{suffix}"


def build_consolidated_report(
    inventory_id: str,
    inventory_date: str,
    revision: int,
    entries: Iterable[AnalysisEntry],
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Entrega a única representação usada para leitura e exportação."""
    raw_entries = list(entries)
    analysis = analyze_entries(inventory_id, revision, raw_entries)
    analysis["generatedAt"] = (generated_at or datetime.now().astimezone()).isoformat()
    records = [
        {
            "side": entry.side,
            "bay": entry.bay.strip(),
            "layer": entry.layer.strip() if entry.layer else None,
            "lot": entry.lot.strip(),
            "quantity": entry.quantity,
        }
        for entry in raw_entries
    ]
    records.sort(
        key=lambda record: (
            0 if record["side"] == "EF" else 1,
            _natural_key(record["bay"]),
            _natural_key(record["layer"] or ""),
            _natural_key(record["lot"]),
        )
    )
    analysis["inventoryDate"] = inventory_date
    analysis["records"] = records
    analysis["totalPieces"] = sum(record["quantity"] for record in records)
    analysis["totalRecords"] = len(records)
    return analysis


def _divergences(report: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for lot in report["lots"]:
        primary = lot.get("primaryLocation")
        if not primary:
            continue
        for location in lot["locations"]:
            if location != primary:
                result.append({"lot": lot["lot"], "primary": primary, "other": location, "classification": lot["classification"], "recommendation": lot.get("recommendation") or "Revisar distribuição."})
    return result


def _workbook_sheet(workbook: Workbook, name: str, headers: list[str]):
    sheet = workbook.create_sheet(name)
    sheet.append(headers)
    fill = PatternFill("solid", fgColor="1F4E78")
    for cell in sheet[1]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = fill
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    return sheet


def _fit_columns(sheet) -> None:
    for column in sheet.columns:
        letter = get_column_letter(column[0].column)
        sheet.column_dimensions[letter].width = min(max(len(str(cell.value or "")) for cell in column) + 2, 52)


def export_xlsx(report: dict[str, Any]) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    inventory = _workbook_sheet(workbook, "INVENTÁRIO", ["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"])
    for record in report["records"]:
        inventory.append([record["side"], record["bay"], record.get("layer") or "—", record["lot"], record["quantity"]])
        inventory.cell(inventory.max_row, 4).number_format = "@"

    lots = _workbook_sheet(workbook, "LOTES CONSOLIDADOS", ["Lote", "Total físico", "Quantidade de locais", "Classificação", "Local principal"])
    for lot in report["lots"]:
        lots.append([lot["lot"], lot["totalQuantity"], len(lot["locations"]), lot["classification"], _location(lot.get("primaryLocation"))])
        lots.cell(lots.max_row, 1).number_format = "@"

    divergences = _workbook_sheet(workbook, "DIVERGÊNCIAS", ["Lote", "Local principal", "Quantidade principal", "Local divergente", "Quantidade divergente", "Classificação", "Recomendação"])
    for item in _divergences(report):
        divergences.append([item["lot"], _location(item["primary"]), item["primary"]["quantity"], _location(item["other"]), item["other"]["quantity"], item["classification"], item["recommendation"]])
        divergences.cell(divergences.max_row, 1).number_format = "@"

    summary = _workbook_sheet(workbook, "RESUMO", ["Indicador", "Valor"])
    values = [("Data", report["inventoryDate"]), ("Quantidade de registros", report["totalRecords"]), ("Total de lotes", report["summary"]["lotsAnalyzed"]), ("Total de peças", report["totalPieces"]), ("Regulares", report["summary"]["regularLots"]), ("Fragmentados", report["summary"]["fragmentedLots"]), ("Peças solteiras", report["summary"]["loosePieces"]), ("Grupos deslocados", report["summary"]["displacedGroups"]), ("Ambíguos", report["summary"]["ambiguousDistributions"]), ("Revisar", report["summary"]["reviewItems"])]
    for value in values:
        summary.append(value)
    for sheet in workbook.worksheets:
        _fit_columns(sheet)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _table_style() -> TableStyle:
    return TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E78")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B8C4CE")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]), ("FONTSIZE", (0, 0), (-1, -1), 8), ("LEADING", (0, 0), (-1, -1), 10)])


def _pdf_table(rows: list[list[Any]], widths: list[float]) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(_table_style())
    return table


def export_pdf(report: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=1.3 * cm, rightMargin=1.3 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    story = [Paragraph("Relatório de Inventário", styles["Title"]), Paragraph(f"Data do inventário: {report['inventoryDate']} · Gerado em: {report['generatedAt']}", styles["Normal"]), Spacer(1, 0.35 * cm)]
    summary = report["summary"]
    story += [Paragraph("Resumo geral", styles["Heading2"]), _pdf_table([["Registros", "Lotes", "Peças", "Fragmentados", "Solteiras", "Deslocados", "Ambíguos"], [report["totalRecords"], summary["lotsAnalyzed"], report["totalPieces"], summary["fragmentedLots"], summary["loosePieces"], summary["displacedGroups"], summary["ambiguousDistributions"]]], [2.2 * cm] * 7), Spacer(1, 0.35 * cm)]
    story += [Paragraph("Inventário organizado", styles["Heading2"]), _pdf_table([["Lado", "Vão", "Camada", "Lote", "Quantidade"]] + [[item["side"], item["bay"], item.get("layer") or "—", item["lot"], item["quantity"]] for item in report["records"]], [1.6 * cm, 1.6 * cm, 2.2 * cm, 7.2 * cm, 2.7 * cm]), PageBreak(), Paragraph("Divergências e recomendações", styles["Heading2"])]
    divergence_rows = [["Lote", "Principal", "Divergente", "Classificação", "Recomendação"]]
    for item in _divergences(report): divergence_rows.append([item["lot"], f"{_location(item['primary'])} ({item['primary']['quantity']})", f"{_location(item['other'])} ({item['other']['quantity']})", item["classification"], item["recommendation"]])
    if len(divergence_rows) == 1: divergence_rows.append(["—", "—", "—", "Sem divergências", "Nenhuma ação necessária."])
    story.append(_pdf_table(divergence_rows, [2.2 * cm, 3.2 * cm, 3.2 * cm, 3.2 * cm, 5.2 * cm]))
    document.build(story)
    return buffer.getvalue()


def export_docx(report: dict[str, Any]) -> bytes:
    document = Document()
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Cm(1.5)
    document.add_heading("Relatório de Inventário", 0)
    document.add_paragraph(f"Data do inventário: {report['inventoryDate']}")
    document.add_paragraph(f"Gerado em: {report['generatedAt']}")
    document.add_heading("Resumo geral", level=1)
    summary = report["summary"]
    document.add_paragraph(f"Registros: {report['totalRecords']} | Lotes: {summary['lotsAnalyzed']} | Peças: {report['totalPieces']}")
    document.add_paragraph(f"Fragmentados: {summary['fragmentedLots']} | Peças solteiras: {summary['loosePieces']} | Grupos deslocados: {summary['displacedGroups']} | Ambíguos: {summary['ambiguousDistributions']}")
    document.add_heading("Registros", level=1)
    table = document.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    for cell, value in zip(table.rows[0].cells, ["Lado", "Vão", "Camada", "Lote", "Quantidade"]): cell.text = value
    for item in report["records"]:
        cells = table.add_row().cells
        for cell, value in zip(cells, [item["side"], item["bay"], item.get("layer") or "—", item["lot"], str(item["quantity"])]): cell.text = value
    document.add_heading("Lotes fragmentados e divergências", level=1)
    divergences = _divergences(report)
    if not divergences: document.add_paragraph("Nenhuma divergência operacional identificada.")
    for item in divergences:
        document.add_paragraph(f"Lote {item['lot']}: principal {_location(item['primary'])} ({item['primary']['quantity']}); divergente {_location(item['other'])} ({item['other']['quantity']}). {item['classification']}. {item['recommendation']}")
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()
