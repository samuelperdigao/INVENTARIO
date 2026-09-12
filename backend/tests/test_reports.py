from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader

from app.engine import AnalysisEntry
from app.reports import build_consolidated_report, export_docx, export_pdf, export_xlsx


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


def test_xlsx_has_operational_tabs_layer_and_lot_as_text() -> None:
    workbook = load_workbook(BytesIO(export_xlsx(report())))
    assert workbook.sheetnames == ["INVENTÁRIO", "LOTES CONSOLIDADOS", "DIVERGÊNCIAS", "RESUMO"]
    inventory = workbook["INVENTÁRIO"]
    lot_cell = next(cell for cell in inventory["D"] if cell.value == "000123")
    assert lot_cell.number_format == "@"
    assert inventory.cell(lot_cell.row, 3).value in {"A1", "A2"}
    assert workbook["RESUMO"]["B3"].value == 9


def test_pdf_and_docx_are_valid_and_contain_critical_content() -> None:
    pdf = PdfReader(BytesIO(export_pdf(report())))
    pdf_text = "".join(page.extract_text() or "" for page in pdf.pages)
    assert "Relatório de Inventário" in pdf_text
    assert "Camada" in pdf_text
    document = Document(BytesIO(export_docx(report())))
    assert "Relatório de Inventário" in "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert document.tables[0].rows[0].cells[2].text == "Camada"
