"""Modelo único e exportadores oficiais dos relatórios V1.

As regras de classificação continuam no motor de análise. Este módulo apenas
prepara uma representação comum e a renderiza em formatos diferentes.
"""

from __future__ import annotations

from copy import copy
from datetime import datetime
from io import BytesIO
from struct import pack
from typing import Any, Iterable
from types import MethodType
from xml.sax.saxutils import escape

import xlwt
from xlwt import BIFFRecords
from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.engine import AnalysisEntry, analyze_entries


BLUE_DARK = "1F4E78"
BLUE_LIGHT = "D9EAF7"
BLUE_PALE = "EDF4FA"
GREY_LIGHT = "F2F2F2"
GREY_BORDER = "B8C4CE"
WHITE = "FFFFFF"
ALERT_RED = "F4CCCC"
ALERT_ORANGE = "FCE4D6"
ALERT_YELLOW = "FFF2CC"
GOOD_GREEN = "E2F0D9"

_ALERT_COLORS = {
    "PEÇA_SOLTEIRA": ALERT_RED,
    "GRUPO_DESLOCADO": ALERT_ORANGE,
    "DISTRIBUIÇÃO_AMBÍGUA": ALERT_YELLOW,
    "REVISAR": ALERT_ORANGE,
    "OK": GOOD_GREEN,
}


def _natural_key(value: str) -> list[object]:
    import re

    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def _location(location: dict[str, Any] | None) -> str:
    if not location:
        return "—"
    layer = location.get("layer")
    suffix = f" · Camada {layer}" if layer else ""
    return f"{location['side']} · Vão {location['bay']}{suffix}"


def build_inventory_report_data(
    inventory_id: str,
    inventory_date: str,
    revision: int,
    entries: Iterable[AnalysisEntry],
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Prepara a fonte única consumida por todos os exportadores."""

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


def build_consolidated_report(
    inventory_id: str,
    inventory_date: str,
    revision: int,
    entries: Iterable[AnalysisEntry],
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Compatibilidade para consumidores que usam o nome histórico."""

    return build_inventory_report_data(inventory_id, inventory_date, revision, entries, generated_at)


def _divergences(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Mantém a definição existente de divergência com local principal confiável."""

    result: list[dict[str, Any]] = []
    for lot in report["lots"]:
        primary = lot.get("primaryLocation")
        if not primary:
            continue
        for location in lot["locations"]:
            if location != primary:
                result.append(
                    {
                        "lot": lot["lot"],
                        "primary": primary,
                        "other": location,
                        "classification": lot["classification"],
                        "recommendation": lot.get("recommendation") or "Revisar distribuição.",
                    }
                )
    return result


def _side_totals(report: dict[str, Any]) -> tuple[dict[str, int], dict[str, int]]:
    records = report["records"]
    pieces = {"DE": 0, "EF": 0}
    counts = {"DE": 0, "EF": 0}
    for record in records:
        side = str(record["side"])
        if side in pieces:
            pieces[side] += int(record["quantity"])
            counts[side] += 1
    return pieces, counts


def _summary_rows(report: dict[str, Any]) -> list[tuple[str, object]]:
    side_pieces, side_counts = _side_totals(report)
    summary = report["summary"]
    divergence_count = len(_divergences(report))
    bay_count = len({(record["side"], record["bay"]) for record in report["records"]})
    fragmented = int(summary["fragmentedLots"])
    if fragmented and divergence_count:
        observation = (
            f"Há {fragmented} lote(s) fragmentado(s) e {divergence_count} divergência(s). "
            "Conferir localização, reunir peças quando aplicável e registrar a ação tomada."
        )
    elif fragmented:
        observation = (
            f"Há {fragmented} lote(s) fragmentado(s) com distribuição ambígua. "
            "Conferir fisicamente antes de realocar."
        )
    else:
        observation = "Nenhuma divergência operacional identificada."
    return [
        ("Data do inventário", report["inventoryDate"]),
        ("Total de registros", report["totalRecords"]),
        ("Total de peças", report["totalPieces"]),
        ("Total de lotes", summary["lotsAnalyzed"]),
        ("Total de vãos", bay_count),
        ("Quantidade de divergências", divergence_count),
        ("Quantidade de lotes fragmentados", fragmented),
        ("Peças lado DE", side_pieces["DE"]),
        ("Peças lado EF", side_pieces["EF"]),
        ("Registros lado DE", side_counts["DE"]),
        ("Registros lado EF", side_counts["EF"]),
        ("Lotes regulares", summary["regularLots"]),
        ("Peças solteiras", summary["loosePieces"]),
        ("Grupos deslocados", summary["displacedGroups"]),
        ("Distribuições ambíguas", summary["ambiguousDistributions"]),
        ("Itens para revisão", summary["reviewItems"]),
        ("Observações importantes", observation),
    ]


def _consolidated_rows(report: dict[str, Any]) -> list[list[object]]:
    rows: list[list[object]] = []
    for lot in report["lots"]:
        primary = lot.get("primaryLocation")
        locations = list(lot.get("locations", []))
        other_locations = [location for location in locations if primary is None or location != primary]
        classification = str(lot["classification"])
        situation = "OK" if not lot.get("fragmented") else f"FRAGMENTADO | {classification}"
        recommendation = lot.get("recommendation") or (
            "Nenhuma ação necessária." if classification == "OK" else "Conferir distribuição do lote."
        )
        rows.append(
            [
                str(lot["lot"]),
                int(lot["totalQuantity"]),
                primary.get("bay") if primary else "Não definido",
                primary.get("side") if primary else "Não definido",
                ", ".join(_location(location) for location in other_locations) or "Nenhum",
                situation,
                recommendation,
            ]
        )
    return rows


def _divergence_rows(report: dict[str, Any]) -> list[list[object]]:
    return [
        [
            str(item["lot"]),
            _location(item["primary"]),
            int(item["primary"]["quantity"]),
            _location(item["other"]),
            int(item["other"]["quantity"]),
            str(item["classification"]),
            str(item["recommendation"]),
        ]
        for item in _divergences(report)
    ]


def _report_subtitle(report: dict[str, Any]) -> str:
    return f"Data do inventário: {report['inventoryDate']} · Revisão: {report['revision']}"


def _xlsx_add_sheet(
    workbook: Workbook,
    name: str,
    headers: list[str],
    rows: list[list[object]],
    *,
    title: str,
    subtitle: str,
    widths: list[int],
    text_columns: set[int] | None = None,
    number_columns: set[int] | None = None,
    row_kinds: list[str] | None = None,
    landscape: bool = True,
) -> None:
    sheet = workbook.create_sheet(name)
    last_column = len(headers)
    last_letter = get_column_letter(last_column)
    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_column)
    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_column)
    sheet.cell(1, 1, title)
    sheet.cell(2, 1, subtitle)
    sheet.cell(1, 1).font = Font(name="Arial", size=15, bold=True, color=WHITE)
    sheet.cell(1, 1).fill = PatternFill("solid", fgColor=BLUE_DARK)
    sheet.cell(1, 1).alignment = Alignment(horizontal="left", vertical="center")
    sheet.cell(2, 1).font = Font(name="Arial", size=10, italic=True, color=BLUE_DARK)
    sheet.cell(2, 1).fill = PatternFill("solid", fgColor=BLUE_LIGHT)
    sheet.cell(2, 1).alignment = Alignment(horizontal="left", vertical="center")
    sheet.row_dimensions[1].height = 28
    sheet.row_dimensions[2].height = 20
    sheet.row_dimensions[3].height = 8

    header_row = 4
    for column_index, header in enumerate(headers, start=1):
        cell = sheet.cell(header_row, column_index, header)
        cell.font = Font(name="Arial", size=10, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=BLUE_DARK)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    sheet.row_dimensions[header_row].height = 30

    text_columns = text_columns or set()
    number_columns = number_columns or set()
    row_kinds = row_kinds or ["body"] * len(rows)
    border = Border(
        left=Side(style="thin", color=GREY_BORDER),
        right=Side(style="thin", color=GREY_BORDER),
        top=Side(style="thin", color=GREY_BORDER),
        bottom=Side(style="thin", color=GREY_BORDER),
    )
    white_fill = PatternFill("solid", fgColor=WHITE)
    alternate_fill = PatternFill("solid", fgColor=BLUE_PALE)
    for row_offset, values in enumerate(rows):
        row_number = header_row + 1 + row_offset
        kind = row_kinds[row_offset] if row_offset < len(row_kinds) else "body"
        row_fill = PatternFill("solid", fgColor=_ALERT_COLORS[kind]) if kind in _ALERT_COLORS else (alternate_fill if row_offset % 2 else white_fill)
        row_font = Font(name="Arial", size=10, color="000000")
        if kind == "total":
            row_fill = PatternFill("solid", fgColor=BLUE_DARK)
            row_font = Font(name="Arial", size=10, bold=True, color=WHITE)
        for column_index, value in enumerate(values, start=1):
            cell = sheet.cell(row_number, column_index, value)
            cell.font = row_font
            cell.fill = row_fill
            cell.border = border
            cell.alignment = Alignment(
                horizontal="right" if column_index in number_columns else "left",
                vertical="center",
                wrap_text=True,
            )
            if column_index in text_columns:
                cell.number_format = "@"
            elif column_index in number_columns:
                cell.number_format = "0"
        if name == "INVENTÁRIO" and values and values[0] in {"DE", "EF"}:
            side_cell = sheet.cell(row_number, 1)
            side_cell.font = Font(name="Arial", size=10, bold=True, color=BLUE_DARK)
            side_cell.fill = PatternFill("solid", fgColor=BLUE_LIGHT)
            side_cell.alignment = Alignment(horizontal="center", vertical="center")
        sheet.row_dimensions[row_number].height = 26 if any(len(str(value or "")) > 34 for value in values) else 20

    last_row = max(header_row, header_row + len(rows))
    sheet.auto_filter.ref = f"A{header_row}:{last_letter}{last_row}"
    sheet.freeze_panes = "A5"
    sheet.sheet_view.showGridLines = False
    for column_index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(column_index)].width = width
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.orientation = "landscape" if landscape else "portrait"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_margins = PageMargins(left=0.25, right=0.25, top=0.5, bottom=0.5, header=0.2, footer=0.2)
    sheet.print_title_rows = "1:4"
    sheet.print_area = f"A1:{last_letter}{last_row}"


def generate_xlsx_report(report: dict[str, Any]) -> bytes:
    """Gera o relatório moderno em XLSX usando valores calculados no backend."""

    workbook = Workbook()
    workbook.remove(workbook.active)
    subtitle = _report_subtitle(report)
    inventory_rows = [
        [record["side"], record["bay"], record.get("layer") or "—", str(record["lot"]), int(record["quantity"])]
        for record in report["records"]
    ]
    inventory_rows.append(["TOTAL", "", "", "", int(report["totalPieces"])])
    _xlsx_add_sheet(
        workbook,
        "RESUMO",
        ["Indicador", "Valor"],
        [[label, value] for label, value in _summary_rows(report)],
        title="Aplicativo Inventário da Laminação de Perfis",
        subtitle=subtitle,
        widths=[38, 92],
        number_columns={2},
        landscape=False,
    )
    _xlsx_add_sheet(
        workbook,
        "INVENTÁRIO",
        ["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"],
        inventory_rows,
        title="INVENTÁRIO",
        subtitle=subtitle,
        widths=[12, 12, 14, 18, 22],
        text_columns={4},
        number_columns={5},
        row_kinds=[str(record["side"]) for record in report["records"]] + ["total"],
    )
    lot_rows = _consolidated_rows(report)
    _xlsx_add_sheet(
        workbook,
        "LOTES CONSOLIDADOS",
        ["Lote", "Total físico de peças", "Vão principal", "Lado principal", "Outros locais encontrados", "Situação do lote", "Recomendação"],
        lot_rows,
        title="LOTES CONSOLIDADOS",
        subtitle=subtitle,
        widths=[16, 20, 15, 17, 38, 30, 58],
        text_columns={1},
        number_columns={2},
        row_kinds=[str(lot["classification"]) for lot in report["lots"]],
    )
    divergence_rows = _divergence_rows(report)
    if not divergence_rows:
        divergence_rows = [["—", "—", "", "—", "", "OK", "Nenhuma ação necessária."]]
        divergence_kinds = ["OK"]
    else:
        divergence_kinds = [str(item["classification"]) for item in _divergences(report)]
    _xlsx_add_sheet(
        workbook,
        "DIVERGÊNCIAS",
        ["Lote", "Local principal", "Qtd. principal", "Local divergente", "Qtd. divergente", "Classificação", "Recomendação"],
        divergence_rows,
        title="DIVERGÊNCIAS",
        subtitle=subtitle,
        widths=[16, 28, 17, 28, 17, 26, 58],
        text_columns={1},
        number_columns={3, 5},
        row_kinds=divergence_kinds,
    )
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_xlsx(report: dict[str, Any]) -> bytes:
    """Compatibilidade para o nome público usado pelo backend atual."""

    return generate_xlsx_report(report)


def _xls_styles() -> dict[str, xlwt.XFStyle]:
    border = "borders: left thin, right thin, top thin, bottom thin;"
    styles = {
        "title": xlwt.easyxf(
            f"font: name Arial, height 280, bold on, colour white; pattern: pattern solid, fore_colour dark_blue; align: horiz left, vert centre; {border}"
        ),
        "subtitle": xlwt.easyxf(
            f"font: name Arial, height 200, italic on, colour dark_blue; pattern: pattern solid, fore_colour pale_blue; align: horiz left, vert centre; {border}"
        ),
        "header": xlwt.easyxf(
            f"font: name Arial, height 200, bold on, colour white; pattern: pattern solid, fore_colour dark_blue; align: horiz center, vert centre, wrap on; {border}"
        ),
        "body": xlwt.easyxf(f"font: name Arial, height 200; align: horiz left, vert centre, wrap on; {border}"),
        "body_alt": xlwt.easyxf(f"font: name Arial, height 200; pattern: pattern solid, fore_colour pale_blue; align: horiz left, vert centre, wrap on; {border}"),
        "body_de": xlwt.easyxf(f"font: name Arial, height 200, bold on, colour dark_blue; pattern: pattern solid, fore_colour pale_blue; align: horiz center, vert centre; {border}"),
        "body_ef": xlwt.easyxf(f"font: name Arial, height 200, bold on, colour dark_blue; pattern: pattern solid, fore_colour ice_blue; align: horiz center, vert centre; {border}"),
        "total": xlwt.easyxf(f"font: name Arial, height 200, bold on, colour white; pattern: pattern solid, fore_colour dark_blue; align: horiz left, vert centre; {border}"),
        "alert_red": xlwt.easyxf(f"font: name Arial, height 200; pattern: pattern solid, fore_colour rose; align: horiz left, vert centre, wrap on; {border}"),
        "alert_orange": xlwt.easyxf(f"font: name Arial, height 200; pattern: pattern solid, fore_colour light_orange; align: horiz left, vert centre, wrap on; {border}"),
        "alert_yellow": xlwt.easyxf(f"font: name Arial, height 200; pattern: pattern solid, fore_colour light_yellow; align: horiz left, vert centre, wrap on; {border}"),
        "good": xlwt.easyxf(f"font: name Arial, height 200; pattern: pattern solid, fore_colour light_green; align: horiz left, vert centre, wrap on; {border}"),
    }
    for name in ("body", "body_alt", "total", "alert_red", "alert_orange", "alert_yellow", "good"):
        numeric = copy(styles[name])
        numeric.num_format_str = "0"
        styles[f"{name}_number"] = numeric
    return styles


def _xls_row_style(styles: dict[str, xlwt.XFStyle], kind: str, row_offset: int) -> xlwt.XFStyle:
    if kind == "total":
        return styles["total"]
    if kind == "PEÇA_SOLTEIRA":
        return styles["alert_red"]
    if kind in {"GRUPO_DESLOCADO", "REVISAR"}:
        return styles["alert_orange"]
    if kind == "DISTRIBUIÇÃO_AMBÍGUA":
        return styles["alert_yellow"]
    if kind == "OK":
        return styles["good"]
    return styles["body_alt"] if row_offset % 2 else styles["body"]


def _xls_add_sheet(
    workbook: xlwt.Workbook,
    name: str,
    headers: list[str],
    rows: list[list[object]],
    *,
    title: str,
    subtitle: str,
    widths: list[int],
    text_columns: set[int] | None = None,
    number_columns: set[int] | None = None,
    row_kinds: list[str] | None = None,
    landscape: bool = True,
) -> None:
    sheet = workbook.add_sheet(name)
    styles = _xls_styles()
    text_columns = text_columns or set()
    number_columns = number_columns or set()
    row_kinds = row_kinds or ["body"] * len(rows)
    sheet.write_merge(0, 0, 0, len(headers) - 1, title, styles["title"])
    sheet.write_merge(1, 1, 0, len(headers) - 1, subtitle, styles["subtitle"])
    for column_index, header in enumerate(headers):
        sheet.write(3, column_index, header, styles["header"])
    sheet.row(0).height = 560
    sheet.row(1).height = 360
    sheet.row(3).height = 520
    for column_index, width in enumerate(widths):
        sheet.col(column_index).width = min(width * 256, 65535)

    for row_offset, values in enumerate(rows):
        row_number = 4 + row_offset
        kind = row_kinds[row_offset] if row_offset < len(row_kinds) else "body"
        base_style = _xls_row_style(styles, kind, row_offset)
        for column_index, value in enumerate(values):
            style = base_style
            if name == "INVENTÁRIO" and column_index == 0 and value in {"DE", "EF"}:
                style = styles["body_de"] if value == "DE" else styles["body_ef"]
            if column_index in number_columns and kind not in {"total", "PEÇA_SOLTEIRA", "GRUPO_DESLOCADO", "DISTRIBUIÇÃO_AMBÍGUA", "REVISAR", "OK"}:
                style = styles["body_alt_number"] if row_offset % 2 else styles["body_number"]
            elif column_index in number_columns:
                style = copy(style)
                style.num_format_str = "0"
            if column_index in text_columns:
                style = copy(style)
                style.num_format_str = "@"
                value = str(value)
            sheet.write(row_number, column_index, value, style)
        sheet.row(row_number).height = 360 if any(len(str(value or "")) > 34 for value in values) else 300

    last_row = max(3, 3 + len(rows))
    # xlwt does not expose the BIFF8 AutoFilter record, so it is attached
    # explicitly below while keeping the workbook within the legacy feature set.
    sheet.set_panes_frozen(True)
    sheet.set_horz_split_pos(4)
    sheet.set_vert_split_pos(0)
    sheet.set_portrait(not landscape)
    sheet.set_paper_size_code(9)  # A4 no catálogo BIFF8.
    sheet.set_fit_width_to_pages(1)
    sheet.set_fit_height_to_pages(0)
    sheet.set_print_scaling(85)
    _xls_attach_autofilter(sheet, len(headers), last_row)


def _biff_record(record_id: int, data: bytes) -> bytes:
    return pack("<HH", record_id, len(data)) + data


def _xls_attach_autofilter(sheet: Any, column_count: int, last_row: int) -> None:
    """Anexa registros AutoFilterInfo/AutoFilter ausentes na API do xlwt."""

    original_get_biff_data = sheet.get_biff_data
    info = _biff_record(0x009D, pack("<H", column_count))
    empty_operator = bytes((0, 0)) + (b"\x00" * 8)
    filters = b"".join(
        _biff_record(0x009E, pack("<HH", column_index, 0) + empty_operator + empty_operator)
        for column_index in range(column_count)
    )
    eof = BIFFRecords.EOFRecord().get()

    def get_biff_data_with_autofilter(self: Any) -> bytes:
        data = original_get_biff_data()
        if not data.endswith(eof):
            raise RuntimeError("A planilha BIFF8 não terminou com EOF válido.")
        return data[: -len(eof)] + info + filters + eof

    sheet.get_biff_data = MethodType(get_biff_data_with_autofilter, sheet)


def _xls_install_filter_names(workbook: xlwt.Workbook, last_rows: list[int], last_columns: list[int]) -> None:
    """Define _FilterDatabase local para que o Excel antigo mostre os filtros."""

    if len(last_rows) != len(last_columns):
        raise ValueError("A configuração dos filtros BIFF8 está inconsistente.")
    # xlwt não oferece nomes definidos, mas mantém os registros de links
    # internos em atributos estáveis. O filtro BIFF8 exige um _FilterDatabase
    # local por planilha apontando para a área que começa no cabeçalho.
    workbook._supbook_xref[('ownbook', 0)] = 0
    workbook._Workbook__sheet_refs.clear()
    for sheet_index in range(len(last_rows)):
        workbook._Workbook__sheet_refs[(0, sheet_index, sheet_index)] = sheet_index

    names = b""
    for sheet_index, (last_row, last_column) in enumerate(zip(last_rows, last_columns)):
        rpn = pack("<BHHHHH", 0x5B, sheet_index, 3, last_row, 0, last_column)
        payload = (
            pack("<HBBHHHBBBB", 0x20, 0, 1, len(rpn), 0, sheet_index + 1, 0, 0, 0, 0)
            + b"\x00\x0d"
            + rpn
        )
        names += _biff_record(0x0018, payload)

    original_links = workbook._Workbook__all_links_rec

    def all_links_with_filter_names(self: Any) -> bytes:
        return original_links() + names

    workbook._Workbook__all_links_rec = MethodType(all_links_with_filter_names, workbook)


def generate_xls_report(report: dict[str, Any]) -> bytes:
    """Gera diretamente um workbook BIFF8/Excel 97-2003, sem conversão."""

    workbook = xlwt.Workbook(encoding="utf-8")
    subtitle = _report_subtitle(report)
    inventory_rows = [
        [record["side"], record["bay"], record.get("layer") or "—", str(record["lot"]), int(record["quantity"])]
        for record in report["records"]
    ]
    inventory_rows.append(["TOTAL", "", "", "", int(report["totalPieces"])])
    _xls_add_sheet(
        workbook,
        "RESUMO",
        ["Indicador", "Valor"],
        [[label, value] for label, value in _summary_rows(report)],
        title="Aplicativo Inventário da Laminação de Perfis",
        subtitle=subtitle,
        widths=[38, 92],
        number_columns={1},
        landscape=False,
    )
    _xls_add_sheet(
        workbook,
        "INVENTÁRIO",
        ["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"],
        inventory_rows,
        title="INVENTÁRIO",
        subtitle=subtitle,
        widths=[12, 12, 14, 18, 22],
        text_columns={3},
        number_columns={4},
        row_kinds=[str(record["side"]) for record in report["records"]] + ["total"],
    )
    _xls_add_sheet(
        workbook,
        "LOTES CONSOLIDADOS",
        ["Lote", "Total físico de peças", "Vão principal", "Lado principal", "Outros locais encontrados", "Situação do lote", "Recomendação"],
        _consolidated_rows(report),
        title="LOTES CONSOLIDADOS",
        subtitle=subtitle,
        widths=[16, 20, 15, 17, 38, 30, 58],
        text_columns={0},
        number_columns={1},
        row_kinds=[str(lot["classification"]) for lot in report["lots"]],
    )
    divergence_rows = _divergence_rows(report)
    if not divergence_rows:
        divergence_rows = [["—", "—", "", "—", "", "OK", "Nenhuma ação necessária."]]
        divergence_kinds = ["OK"]
    else:
        divergence_kinds = [str(item["classification"]) for item in _divergences(report)]
    _xls_add_sheet(
        workbook,
        "DIVERGÊNCIAS",
        ["Lote", "Local principal", "Qtd. principal", "Local divergente", "Qtd. divergente", "Classificação", "Recomendação"],
        divergence_rows,
        title="DIVERGÊNCIAS",
        subtitle=subtitle,
        widths=[16, 28, 17, 28, 17, 26, 58],
        text_columns={0},
        number_columns={2, 4},
        row_kinds=divergence_kinds,
    )
    _xls_install_filter_names(
        workbook,
        [
            3 + len(_summary_rows(report)),
            3 + len(inventory_rows),
            3 + len(report["lots"]),
            3 + len(divergence_rows),
        ],
        [1, 4, 6, 6],
    )
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_xls(report: dict[str, Any]) -> bytes:
    """Compatibilidade para o nome público do gerador legado."""

    return generate_xls_report(report)


def _pdf_value(value: object) -> str:
    return escape("—" if value is None or value == "" else str(value)).replace("\n", "<br/>")


def _pdf_table(rows: list[list[object]], widths: list[float], row_kinds: list[str] | None = None) -> Table:
    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle("report-cell", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=9, alignment=TA_LEFT, spaceAfter=0)
    header_style = ParagraphStyle("report-header", parent=cell_style, fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_LEFT)
    rendered = [
        [Paragraph(_pdf_value(value), header_style if row_index == 0 else cell_style) for value in row]
        for row_index, row in enumerate(rows)
    ]
    table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{BLUE_DARK}")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor(f"#{GREY_BORDER}")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(f"#{BLUE_PALE}")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_offset, kind in enumerate(row_kinds or [], start=1):
        if kind == "total":
            commands.append(("BACKGROUND", (0, row_offset), (-1, row_offset), colors.HexColor(f"#{BLUE_DARK}")))
            commands.append(("TEXTCOLOR", (0, row_offset), (-1, row_offset), colors.white))
        elif kind in _ALERT_COLORS:
            commands.append(("BACKGROUND", (0, row_offset), (-1, row_offset), colors.HexColor(f"#{_ALERT_COLORS[kind]}")))
    table.setStyle(TableStyle(commands))
    return table


def _pdf_page_frame(canvas: Any, document: Any) -> None:
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor(f"#{GREY_BORDER}"))
    canvas.line(document.leftMargin, A4[1] - 1.35 * cm, A4[0] - document.rightMargin, A4[1] - 1.35 * cm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor(f"#{BLUE_DARK}"))
    canvas.drawString(document.leftMargin, A4[1] - 1.05 * cm, "INVENTÁRIO · RELATÓRIO OFICIAL")
    canvas.drawRightString(A4[0] - document.rightMargin, 0.75 * cm, f"Página {canvas.getPageNumber()}")
    canvas.restoreState()


def export_pdf(report: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("report-title", parent=styles["Title"], textColor=colors.HexColor(f"#{BLUE_DARK}"), fontSize=18, leading=22, alignment=TA_LEFT, spaceAfter=4)
    subtitle_style = ParagraphStyle("report-subtitle", parent=styles["Normal"], textColor=colors.HexColor("#4F5B66"), fontSize=9, leading=12, spaceAfter=8)
    heading_style = ParagraphStyle("report-heading", parent=styles["Heading2"], textColor=colors.HexColor(f"#{BLUE_DARK}"), fontSize=12, leading=14, spaceBefore=8, spaceAfter=6)
    note_style = ParagraphStyle("report-note", parent=styles["BodyText"], fontSize=9, leading=12, spaceBefore=5, spaceAfter=5)
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.3 * cm,
        rightMargin=1.3 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.4 * cm,
    )
    summary_rows = [["Indicador", "Valor"]] + [[label, value] for label, value in _summary_rows(report)]
    inventory_rows = [["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"]]
    inventory_rows.extend(
        [[record["side"], record["bay"], record.get("layer") or "—", str(record["lot"]), int(record["quantity"])] for record in report["records"]]
    )
    inventory_rows.append(["TOTAL", "", "", "", int(report["totalPieces"])])
    lot_rows = [["Lote", "Total físico", "Vão principal", "Lado principal", "Outros locais", "Situação", "Recomendação"]] + _consolidated_rows(report)
    divergence_data = _divergence_rows(report)
    if not divergence_data:
        divergence_data = [["—", "—", "", "—", "", "OK", "Nenhuma ação necessária."]]
        divergence_kinds = ["OK"]
    else:
        divergence_kinds = [str(item["classification"]) for item in _divergences(report)]
    divergence_rows = [["Lote", "Local principal", "Qtd.", "Local divergente", "Qtd.", "Classificação", "Recomendação"]] + divergence_data
    story: list[Any] = [
        Paragraph("Aplicativo Inventário da Laminação de Perfis", title_style),
        Paragraph("Relatório de Inventário", heading_style),
        Paragraph(f"{_report_subtitle(report)} · Gerado em: {report['generatedAt']}", subtitle_style),
        Paragraph("Resumo geral", heading_style),
        _pdf_table(summary_rows, [10.3 * cm, 7.9 * cm]),
        Paragraph("Observação operacional", heading_style),
        Paragraph(str(dict(_summary_rows(report))["Observações importantes"]), note_style),
        Spacer(1, 0.15 * cm),
        Paragraph("Inventário", heading_style),
        _pdf_table(
            inventory_rows,
            [1.5 * cm, 1.45 * cm, 2.0 * cm, 7.0 * cm, 2.25 * cm],
            [str(record["side"]) for record in report["records"]] + ["total"],
        ),
        PageBreak(),
        Paragraph("Lotes consolidados", heading_style),
        _pdf_table(
            lot_rows,
            [1.55 * cm, 1.75 * cm, 2.1 * cm, 2.15 * cm, 3.9 * cm, 2.55 * cm, 4.0 * cm],
            [str(lot["classification"]) for lot in report["lots"]],
        ),
        PageBreak(),
        Paragraph("Divergências e recomendações", heading_style),
        _pdf_table(divergence_rows, [1.55 * cm, 2.7 * cm, 1.2 * cm, 2.7 * cm, 1.2 * cm, 2.7 * cm, 5.7 * cm], divergence_kinds),
    ]
    document.build(story, onFirstPage=_pdf_page_frame, onLaterPages=_pdf_page_frame)
    return buffer.getvalue()


def _docx_set_shading(cell: Any, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:fill"), fill)


def _docx_set_repeat_header(row: Any) -> None:
    properties = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    properties.append(header)


def _docx_cell_text(cell: Any, value: object, *, header: bool = False, white: bool = False) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER if header else WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run("—" if value is None or value == "" else str(value))
    run.font.name = "Arial"
    run.font.size = Pt(8 if header else 7.5)
    run.font.bold = header
    if white:
        run.font.color.rgb = RGBColor(255, 255, 255)


def _docx_add_table(
    document: Document,
    headers: list[str],
    rows: list[list[object]],
    widths: list[float],
    *,
    row_kinds: list[str] | None = None,
) -> Any:
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    _docx_set_repeat_header(table.rows[0])
    for column_index, header in enumerate(headers):
        cell = table.rows[0].cells[column_index]
        cell.width = Cm(widths[column_index])
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _docx_set_shading(cell, BLUE_DARK)
        _docx_cell_text(cell, header, header=True, white=True)
    for row_offset, values in enumerate(rows):
        kind = (row_kinds or ["body"] * len(rows))[row_offset]
        row = table.add_row()
        fill = _ALERT_COLORS.get(kind, BLUE_PALE if row_offset % 2 else WHITE)
        white = kind == "total"
        if white:
            fill = BLUE_DARK
        for column_index, value in enumerate(values):
            cell = row.cells[column_index]
            cell.width = Cm(widths[column_index])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            _docx_set_shading(cell, fill)
            _docx_cell_text(cell, value, white=white)
    return table


def _docx_add_page_field(paragraph: Any) -> None:
    run = paragraph.add_run("Página ")
    run.font.name = "Arial"
    run.font.size = Pt(8)
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = " PAGE "
    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")
    run._r.append(field_begin)
    run._r.append(instruction)
    run._r.append(field_end)


def export_docx(report: dict[str, Any]) -> bytes:
    document = Document()
    section = document.sections[0]
    section.top_margin = Cm(1.7)
    section.bottom_margin = Cm(1.5)
    section.left_margin = Cm(1.4)
    section.right_margin = Cm(1.4)
    section.header_distance = Cm(0.7)
    section.footer_distance = Cm(0.7)
    header = section.header.paragraphs[0]
    header.text = "INVENTÁRIO · RELATÓRIO OFICIAL"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header.runs[0].font.name = "Arial"
    header.runs[0].font.size = Pt(8)
    header.runs[0].font.color.rgb = RGBColor(31, 78, 120)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _docx_add_page_field(footer)

    document.core_properties.title = "Relatório de Inventário"
    title = document.add_heading("Aplicativo Inventário da Laminação de Perfis", level=0)
    title.runs[0].font.name = "Arial"
    title.runs[0].font.color.rgb = RGBColor(31, 78, 120)
    document.add_paragraph("Relatório de Inventário")
    document.add_paragraph(f"{_report_subtitle(report)} · Gerado em: {report['generatedAt']}")
    document.add_heading("Resumo geral", level=1)
    _docx_add_table(
        document,
        ["Indicador", "Valor"],
        [[label, value] for label, value in _summary_rows(report)],
        [7.0, 10.0],
    )
    document.add_heading("Inventário", level=1)
    inventory_rows = [
        [record["side"], record["bay"], record.get("layer") or "—", str(record["lot"]), int(record["quantity"])]
        for record in report["records"]
    ]
    inventory_rows.append(["TOTAL", "", "", "", int(report["totalPieces"])])
    _docx_add_table(
        document,
        ["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"],
        inventory_rows,
        [1.5, 1.45, 2.0, 7.0, 2.4],
        row_kinds=[str(record["side"]) for record in report["records"]] + ["total"],
    )
    document.add_page_break()
    document.add_heading("Lotes consolidados", level=1)
    _docx_add_table(
        document,
        ["Lote", "Total físico", "Vão principal", "Lado principal", "Outros locais", "Situação", "Recomendação"],
        _consolidated_rows(report),
        [1.5, 1.7, 1.8, 1.9, 3.3, 2.5, 4.7],
        row_kinds=[str(lot["classification"]) for lot in report["lots"]],
    )
    document.add_page_break()
    document.add_heading("Divergências e recomendações", level=1)
    divergence_data = _divergence_rows(report)
    if not divergence_data:
        divergence_data = [["—", "—", "", "—", "", "OK", "Nenhuma ação necessária."]]
        divergence_kinds = ["OK"]
    else:
        divergence_kinds = [str(item["classification"]) for item in _divergences(report)]
    _docx_add_table(
        document,
        ["Lote", "Local principal", "Qtd.", "Local divergente", "Qtd.", "Classificação", "Recomendação"],
        divergence_data,
        [1.5, 2.7, 1.2, 2.7, 1.2, 2.6, 5.1],
        row_kinds=divergence_kinds,
    )
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()
