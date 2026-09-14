from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader
from xlrd import XL_CELL_TEXT, open_workbook

from app.engine import AnalysisEntry
from app.reports import build_consolidated_report, export_docx, export_pdf, export_xls, export_xlsx


def report() -> dict[str, object]:
    return build_consolidated_report(
        str(uuid4()), "2026-09-11", 3,
        [
            AnalysisEntry(side="DE", bay="15", layer="A1", lot="000123", quantity=19),
            AnalysisEntry(side="EF", bay="21", layer="A2", lot="000123", quantity=1),
            AnalysisEntry(side="DE", bay="08", lot="10", quantity=15),
            AnalysisEntry(side="EF", bay="11", lot="10", quantity=2),
            AnalysisEntry(side="DE", bay="20", lot="10", quantity=3),
            AnalysisEntry(side="EF", bay="01", lot="20", quantity=10),
            AnalysisEntry(side="DE", bay="01", lot="20", quantity=10),
            AnalysisEntry(side="EF", bay="02", lot="30", quantity=11),
            AnalysisEntry(side="DE", bay="02", lot="30", quantity=9),
        ],
        datetime(2026, 9, 11, tzinfo=timezone.utc),
    )


def test_consolidated_model_applies_required_classifications() -> None:
    lots = {lot["lot"]: lot for lot in report()["lots"]}  # type: ignore[index]
    assert lots["000123"]["classification"] == "PEÇA_SOLTEIRA"
    assert lots["10"]["classification"] == "GRUPO_DESLOCADO"
    assert lots["20"]["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"
    assert lots["30"]["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"
    assert lots["000123"]["presentation"]["situation"] == "1 PEÇA FORA DO LOCAL PRINCIPAL"
    assert lots["000123"]["presentation"]["primaryLocation"]["display"] == "DE 15 · A1 · 19 pç"
    assert lots["000123"]["presentation"]["otherLocations"][0]["display"] == "EF 21 · A2 · 1 pç"
    assert lots["000123"]["presentation"]["outOfPrimaryQuantity"] == 1
    assert lots["000123"]["presentation"]["action"] == "Conferir a peça localizada em EF 21 · A2."
    assert lots["10"]["presentation"]["situation"] == "5 PEÇAS FORA DO LOCAL PRINCIPAL"
    assert lots["10"]["presentation"]["action"] == "Conferir as 5 peças encontradas fora de DE 08."
    assert lots["20"]["presentation"]["situation"] == "LOTE DISTRIBUÍDO EM MAIS DE UM LOCAL"
    assert lots["30"]["presentation"]["situation"] == "LOTE DISTRIBUÍDO EM MAIS DE UM LOCAL"
    assert lots["20"]["presentation"]["primaryLocation"] is None
    assert lots["20"]["presentation"]["outOfPrimaryQuantity"] is None
    assert lots["20"]["presentation"]["action"] == "Conferir fisicamente o lote. Não foi identificado um local principal com segurança."
    assert report()["summary"]["lotsForConference"] == 4  # type: ignore[index]


def test_operational_presentation_covers_ok_and_layers() -> None:
    result = build_consolidated_report(
        str(uuid4()), "2026-09-11", 3,
        [
            AnalysisEntry(side="DE", bay="15", layer="A1", lot="000001", quantity=20),
            AnalysisEntry(side="DE", bay="15", layer="A1", lot="000002", quantity=19),
            AnalysisEntry(side="DE", bay="15", layer="A2", lot="000002", quantity=1),
        ],
        datetime(2026, 9, 11, tzinfo=timezone.utc),
    )
    lots = {lot["lot"]: lot for lot in result["lots"]}  # type: ignore[index]
    assert lots["000001"]["presentation"]["situation"] == "OK"
    assert lots["000001"]["presentation"]["locations"][0]["label"] == "DE 15 · A1"
    assert lots["000002"]["presentation"]["primaryLocation"]["display"] == "DE 15 · A1 · 19 pç"
    assert lots["000002"]["presentation"]["otherLocations"][0]["display"] == "DE 15 · A2 · 1 pç"


def test_xlsx_has_operational_tabs_layer_and_lot_as_text() -> None:
    workbook = load_workbook(BytesIO(export_xlsx(report())))
    assert workbook.sheetnames == ["RESUMO", "INVENTÁRIO", "LOTES CONSOLIDADOS", "LOTES PARA CONFERÊNCIA"]
    inventory = workbook["INVENTÁRIO"]
    lot_cell = next(cell for cell in inventory["D"] if cell.value == "000123")
    assert lot_cell.number_format == "@"
    assert inventory.cell(lot_cell.row, 3).value in {"A1", "A2"}
    assert inventory.freeze_panes == "A5"
    assert inventory.auto_filter.ref is None
    assert inventory.sheet_view.showGridLines is False
    assert inventory.print_options.gridLines is False
    assert inventory["D5"].alignment.horizontal == "center"
    assert inventory.page_setup.paperSize == 9
    summary = {workbook["RESUMO"].cell(row, 1).value: workbook["RESUMO"].cell(row, 2).value for row in range(5, 22)}
    assert summary["Total de registros"] == 9
    assert summary["Total de lotes"] == 4
    assert summary["Total de peças"] == 80
    assert summary["Lotes OK"] == 0
    assert summary["Lotes para conferência"] == 4
    assert summary["1 peça fora do local principal"] == 1
    assert summary["Lotes com múltiplas peças fora do local principal"] == 1
    assert summary["Lotes distribuídos em mais de um local"] == 2
    assert workbook["LOTES PARA CONFERÊNCIA"].max_row == 8
    assert workbook["LOTES PARA CONFERÊNCIA"].cell(5, 1).value == "10"
    assert workbook["LOTES PARA CONFERÊNCIA"].cell(5, 3).value == "5 PEÇAS FORA DO LOCAL PRINCIPAL"
    assert workbook["LOTES PARA CONFERÊNCIA"].cell(5, 6).value == 5


def test_xls_is_biff8_with_same_tabs_and_text_lots() -> None:
    content = export_xls(report())
    assert len(content) > 0
    assert content[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    workbook = open_workbook(file_contents=content, formatting_info=True)
    assert workbook.sheet_names() == ["RESUMO", "INVENTÁRIO", "LOTES CONSOLIDADOS", "LOTES PARA CONFERÊNCIA"]
    assert sum(name.name == "_FilterDatabase" for name in workbook.name_obj_list) == 0
    assert all(not workbook.sheet_by_name(name).show_grid_lines for name in workbook.sheet_names())
    inventory = workbook.sheet_by_name("INVENTÁRIO")
    lot_row = next(row for row in range(inventory.nrows) if inventory.cell_value(row, 3) == "000123")
    assert inventory.cell_type(lot_row, 3) == XL_CELL_TEXT
    assert inventory.cell_value(lot_row, 2) in {"A1", "A2"}
    summary_sheet = workbook.sheet_by_name("RESUMO")
    summary = {summary_sheet.cell_value(row, 0): summary_sheet.cell_value(row, 1) for row in range(4, summary_sheet.nrows)}
    assert summary["Total de registros"] == 9
    assert summary["Total de lotes"] == 4
    assert summary["Total de peças"] == 80
    assert summary["Lotes para conferência"] == 4
    assert summary["Lotes distribuídos em mais de um local"] == 2
    conference = workbook.sheet_by_name("LOTES PARA CONFERÊNCIA")
    assert conference.cell_value(4, 0) == "10"
    assert conference.cell_value(4, 2) == "5 PEÇAS FORA DO LOCAL PRINCIPAL"
    assert conference.cell_value(4, 5) == 5
    assert workbook.sheet_by_name("LOTES CONSOLIDADOS").rowinfo_map[4].height >= 900
    assert conference.rowinfo_map[4].height >= 600


def test_pdf_and_docx_are_valid_and_contain_critical_content() -> None:
    pdf = PdfReader(BytesIO(export_pdf(report())))
    pdf_text = "".join(page.extract_text() or "" for page in pdf.pages)
    assert "Relatório de Inventário" in pdf_text
    assert "Camada" in pdf_text
    assert "Lotes consolidados" in pdf_text
    assert "Lotes para conferência" in pdf_text
    assert "1 PEÇA FORA DO LOCAL PRINCIPAL" in pdf_text
    assert "DISTRIBUIÇÃO_AMBÍGUA" not in pdf_text
    document = Document(BytesIO(export_docx(report())))
    assert "Relatório de Inventário" in "\n".join(paragraph.text for paragraph in document.paragraphs)
    raw_table = next(table for table in document.tables if len(table.rows[0].cells) >= 3 and table.rows[0].cells[2].text == "Camada")
    assert raw_table.rows[0].cells[3].text == "Lote"
    assert len(document.tables) == 4
    docx_text = "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
    assert "Lotes para conferência" in "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert "1 PEÇA FORA DO LOCAL PRINCIPAL" in docx_text
    assert "DISTRIBUIÇÃO_AMBÍGUA" not in docx_text
