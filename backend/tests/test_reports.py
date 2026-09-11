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
            AnalysisEntry(side="DE", bay="15", lot="000123", quantity=19),
            AnalysisEntry(side="EF", bay="21", lot="000123", quantity=1),
            AnalysisEntry(side="DE", bay="08", lot="LOTE-GRUPO", quantity=15),
            AnalysisEntry(side="EF", bay="11", lot="LOTE-GRUPO", quantity=2),
            AnalysisEntry(side="DE", bay="20", lot="LOTE-GRUPO", quantity=3),
            AnalysisEntry(side="EF", bay="01", lot="EMPATE", quantity=10),
            AnalysisEntry(side="DE", bay="01", lot="EMPATE", quantity=10),
            AnalysisEntry(side="EF", bay="02", lot="PROXIMO", quantity=11),
            AnalysisEntry(side="DE", bay="02", lot="PROXIMO", quantity=9),
        ],
        datetime(2026, 9, 11, tzinfo=timezone.utc),
    )


def test_consolidated_model_applies_required_classifications() -> None:
    lots = {lot["lot"]: lot for lot in report()["lots"]}  # type: ignore[index]
    assert lots["000123"]["classification"] == "PEÇA_SOLTEIRA"
    assert lots["LOTE-GRUPO"]["classification"] == "GRUPO_DESLOCADO"
    assert lots["EMPATE"]["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"
    assert lots["PROXIMO"]["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"


def test_xlsx_has_operational_tabs_and_lot_as_text() -> None:
    workbook = load_workbook(BytesIO(export_xlsx(report())))
    assert workbook.sheetnames == ["INVENTÁRIO", "LOTES CONSOLIDADOS", "DIVERGÊNCIAS", "RESUMO"]
    inventory = workbook["INVENTÁRIO"]
    lot_cell = next(cell for cell in inventory["C"] if cell.value == "000123")
    assert lot_cell.number_format == "@"
    assert workbook["RESUMO"]["B3"].value == 9


def test_pdf_and_docx_are_valid_and_contain_critical_content() -> None:
    pdf = PdfReader(BytesIO(export_pdf(report())))
    assert "Relatório de Inventário" in "".join(page.extract_text() or "" for page in pdf.pages)
    document = Document(BytesIO(export_docx(report())))
    assert "Relatório de Inventário" in "\n".join(paragraph.text for paragraph in document.paragraphs)
