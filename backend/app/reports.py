"""Modelo único e exportadores oficiais dos relatórios V1.

As regras de classificação continuam no motor de análise. Este módulo apenas
prepara uma representação comum e a renderiza em formatos diferentes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone, tzinfo
from io import BytesIO
from typing import Any, Iterable, Mapping
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import xlwt
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.engine import AnalysisEntry, analyze_entries
from app.lot_rules import validate_lot
from app.presentation import apply_report_presentation, build_lot_presentation


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
    "single-piece": ALERT_YELLOW,
    "multiple-pieces": ALERT_ORANGE,
    "distributed": ALERT_RED,
    "review": ALERT_ORANGE,
    "ok": GOOD_GREEN,
}


def _natural_key(value: str) -> list[object]:
    import re

    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def build_inventory_report_data(
    inventory_id: str,
    inventory_date: str,
    revision: int,
    entries: Iterable[AnalysisEntry],
    generated_at: datetime | None = None,
    *,
    reference_lots: Iterable[str] | None = None,
    reference_metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Prepara a fonte única consumida por todos os exportadores."""

    raw_entries = list(entries)
    analysis = analyze_entries(inventory_id, revision, raw_entries)
    if reference_lots is not None:
        normalized_reference = {validate_lot(lot) for lot in reference_lots}
        physical_lots = {str(lot["lot"]) for lot in analysis["lots"]}
        for lot in analysis["lots"]:
            lot["referenceStatus"] = "EXPECTED_FOUND" if lot["lot"] in normalized_reference else "OUTSIDE_REFERENCE"
            lot["physicalFound"] = True
        for missing_lot in sorted(normalized_reference - physical_lots, key=_natural_key):
            analysis["lots"].append(
                {
                    "lot": missing_lot,
                    "totalQuantity": 0,
                    "locations": [],
                    "fragmented": False,
                    "classification": "REVISAR",
                    "primaryLocation": None,
                    "displacedQuantity": 0,
                    "recommendation": "Nenhum lançamento físico foi encontrado para este lote previsto.",
                    "referenceStatus": "EXPECTED_MISSING",
                    "physicalFound": False,
                }
            )
        analysis["lots"].sort(key=lambda lot: _natural_key(str(lot["lot"])))
        physical_fragmented = sum(1 for lot in analysis["lots"] if lot.get("physicalFound") and lot.get("fragmented"))
        analysis["reference"] = {
            "available": True,
            **dict(reference_metadata or {}),
            "totalLots": len(normalized_reference),
            "foundLots": len(normalized_reference & physical_lots),
            "missingLots": len(normalized_reference - physical_lots),
            "outsideReferenceLots": len(physical_lots - normalized_reference),
            "fragmentedLots": physical_fragmented,
            "physicalDistinctLots": len(physical_lots),
        }
    analysis = apply_report_presentation(analysis)
    analysis["generatedAt"] = (generated_at or datetime.now().astimezone()).isoformat()
    records = [
        {
            "side": entry.side,
            "bay": entry.bay.strip(),
            "layer": entry.layer.strip() if entry.layer else None,
            "lot": validate_lot(entry.lot),
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
    *,
    reference_lots: Iterable[str] | None = None,
    reference_metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Compatibilidade para consumidores que usam o nome histórico."""

    return build_inventory_report_data(
        inventory_id,
        inventory_date,
        revision,
        entries,
        generated_at,
        reference_lots=reference_lots,
        reference_metadata=reference_metadata,
    )


REPORT_TIMEZONE_NAME = "America/Sao_Paulo"
CONCILIATION_HEADERS = ["Lote", "Referência", "Físico", "Localização", "Qtd. física", "Condição"]


class ReportConsistencyError(ValueError):
    """Os totais do relatório não fecham; nenhum arquivo deve ser gerado."""


def _report_timezone() -> tzinfo:
    try:
        return ZoneInfo(REPORT_TIMEZONE_NAME)
    except ZoneInfoNotFoundError:
        # Sem base IANA no host, vale o fuso oficial de Brasília sem horário de verão.
        return timezone(timedelta(hours=-3), "BRT")


def format_generated_at(value: object) -> str:
    """Converte o instante de geração para o horário de Brasília legível."""

    if isinstance(value, datetime):
        moment = value
    elif isinstance(value, str) and value:
        try:
            moment = datetime.fromisoformat(value)
        except ValueError:
            return value
    else:
        return "Não informado"
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(_report_timezone())
    return f"{local:%d/%m/%Y} às {local:%H:%M}"


def parse_report_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def format_report_date(value: object) -> str:
    parsed = parse_report_date(value)
    return f"{parsed:%d/%m/%Y}" if parsed else str(value)


def format_int(value: int) -> str:
    """Formata inteiros com separador de milhar brasileiro (2.667)."""

    return f"{int(value):,}".replace(",", ".")


def _bay_value(bay: str) -> object:
    """Vão vira número no Excel somente quando a conversão é exata."""

    return int(bay) if bay.isdigit() and str(int(bay)) == bay else bay


def _presentation(lot: Mapping[str, Any]) -> Mapping[str, Any]:
    return lot.get("presentation") or build_lot_presentation(lot)


def _has_reference(report: Mapping[str, Any]) -> bool:
    reference = report.get("reference")
    return isinstance(reference, Mapping) and bool(reference.get("available"))


def _is_physical(lot: Mapping[str, Any]) -> bool:
    return bool(lot.get("physicalFound", lot.get("referenceStatus") != "EXPECTED_MISSING"))


@dataclass(frozen=True)
class TotalsCheck:
    """Números da autoverificação, exibidos no quadro "Conferência dos totais"."""

    records_pieces: int
    lots_pieces: int
    summary_pieces: int
    bay_pieces: int
    records: int
    summary_records: int

    def rows(self) -> list[tuple[str, str]]:
        return [
            ("Soma dos lançamentos", format_int(self.records_pieces)),
            ("Soma dos lotes", format_int(self.lots_pieces)),
            ("Total do resumo", format_int(self.summary_pieces)),
            ("Soma dos subtotais por vão", format_int(self.bay_pieces)),
            ("Registros: lançados × resumo", f"{format_int(self.records)} × {format_int(self.summary_records)}"),
        ]


def verify_report_totals(report: Mapping[str, Any]) -> TotalsCheck:
    """Confere que lançamentos, lotes, resumo e subtotais por vão fecham.

    Qualquer divergência interrompe a exportação: é preferível não entregar
    um arquivo a entregar um arquivo com totais que não batem.
    """

    records = list(report.get("records") or [])
    lots = [lot for lot in report.get("lots", []) if isinstance(lot, Mapping)]
    physical_lots = [lot for lot in lots if _is_physical(lot)]
    summary = report.get("summary") or {}
    problems: list[str] = []

    records_pieces = sum(int(record["quantity"]) for record in records)
    lots_pieces = sum(int(lot.get("totalQuantity", 0)) for lot in physical_lots)
    summary_pieces = int(report.get("totalPieces", -1))
    bay_pieces = sum(group["pieces"] for group in _bay_groups(records))
    if not records_pieces == lots_pieces == summary_pieces == bay_pieces:
        problems.append(
            "peças não fecham: lançamentos "
            f"{format_int(records_pieces)}, lotes {format_int(lots_pieces)}, resumo {format_int(summary_pieces)}, "
            f"subtotais por vão {format_int(bay_pieces)}"
        )
    if len(records) != int(report.get("totalRecords", -1)):
        problems.append(f"registros não fecham: {len(records)} lançamentos para {report.get('totalRecords')} no resumo")

    pieces_by_lot: dict[str, int] = {}
    for record in records:
        pieces_by_lot[str(record["lot"])] = pieces_by_lot.get(str(record["lot"]), 0) + int(record["quantity"])
    lots_by_id = {str(lot["lot"]): int(lot.get("totalQuantity", 0)) for lot in physical_lots}
    if pieces_by_lot != lots_by_id:
        divergent = sorted(set(pieces_by_lot) ^ set(lots_by_id) | {
            lot for lot in set(pieces_by_lot) & set(lots_by_id) if pieces_by_lot[lot] != lots_by_id[lot]
        })
        problems.append(f"lotes divergentes dos lançamentos: {', '.join(divergent[:5])}")
    for lot in physical_lots:
        located = sum(int(location.get("quantity", 0)) for location in lot.get("locations", []) if isinstance(location, Mapping))
        if located != int(lot.get("totalQuantity", 0)):
            problems.append(f"lote {lot['lot']} soma {located} nos locais e {lot.get('totalQuantity')} no total")
    if int(summary.get("lotsAnalyzed", -1)) != len(physical_lots):
        problems.append(f"total de lotes do resumo ({summary.get('lotsAnalyzed')}) difere dos {len(physical_lots)} lotes analisados")
    if "lotsOk" in summary and int(summary["lotsOk"]) + int(summary.get("lotsForConference", 0)) != len(lots):
        problems.append("lotes OK somados aos lotes para conferência não fecham com o total de lotes")
    if problems:
        raise ReportConsistencyError(
            "Relatório não gerado: os totais não conferem (" + "; ".join(problems) + ")."
        )
    return TotalsCheck(
        records_pieces=records_pieces,
        lots_pieces=lots_pieces,
        summary_pieces=summary_pieces,
        bay_pieces=bay_pieces,
        records=len(records),
        summary_records=int(report["totalRecords"]),
    )


def _bay_groups(records: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa os lançamentos por lado e vão, na ordem já definida pelo modelo."""

    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        key = (str(record["side"]), str(record["bay"]))
        group = groups.setdefault(key, {"side": key[0], "bay": key[1], "records": 0, "pieces": 0, "entries": []})
        group["records"] += 1
        group["pieces"] += int(record["quantity"])
        group["entries"].append(record)
    return list(groups.values())


SIDE_ORDER = ("EF", "DE")


def _route_key(location: Mapping[str, Any]) -> tuple[object, ...]:
    """Ordem de trajeto no pátio: lado EF e depois DE, vão e camada crescentes."""

    side = str(location.get("side", ""))
    return (
        SIDE_ORDER.index(side) if side in SIDE_ORDER else len(SIDE_ORDER),
        _natural_key(str(location.get("bay", ""))),
        _natural_key(str(location.get("layer") or "")),
    )


@dataclass(frozen=True)
class ReportView:
    """Apresentação comum a todos os exportadores.

    Só formata e organiza o que `build_inventory_report_data` já calculou;
    nenhum exportador recalcula totais ou classificações.
    """

    inventory_date: date | None
    inventory_date_label: str
    revision: int
    generated_at_label: str
    total_records: int
    total_pieces: int
    summary: list[tuple[str, object]]
    observation: str
    records: list[dict[str, Any]]
    bay_groups: list[dict[str, Any]]
    consolidated_rows: list[list[object]]
    consolidated_kinds: list[str]
    has_reference: bool
    totals_check: TotalsCheck
    lots_ok: int
    lots_for_conference: int
    state_counts: list[tuple[str, int, str]]
    side_rows: list[list[object]]
    bay_map_columns: list[str]
    bay_map_rows: list[list[object]]
    route_rows: list[list[object]]
    route_kinds: list[str]
    reference_summary: list[tuple[str, object]] = field(default_factory=list)
    lot_location_rows: list[list[object]] = field(default_factory=list)
    lot_location_kinds: list[str] = field(default_factory=list)
    conciliation_rows: list[list[object]] = field(default_factory=list)
    conciliation_kinds: list[str] = field(default_factory=list)

    @property
    def subtitle(self) -> str:
        return f"Data do inventário: {self.inventory_date_label} · Revisão: {self.revision}"

    @property
    def generated_line(self) -> str:
        return f"{self.subtitle} · Gerado em: {self.generated_at_label}"

    def grouped_rows(self) -> tuple[list[list[object]], list[str]]:
        """Lançamentos por lado e vão com subtotal de cada vão e de cada lado."""

        rows: list[list[object]] = []
        kinds: list[str] = []
        for side in SIDE_ORDER:
            groups = [group for group in self.bay_groups if group["side"] == side]
            if not groups:
                continue
            for group in groups:
                for record in group["entries"]:
                    rows.append([record["side"], record["bay"], record.get("layer") or "—", str(record["lot"]), int(record["quantity"])])
                    kinds.append("record")
                rows.append(["", "", "", f"Subtotal {side} {group['bay']} · {format_int(group['records'])} reg.", group["pieces"]])
                kinds.append("subtotal")
            side_records = sum(group["records"] for group in groups)
            rows.append(["", "", "", f"Total lado {side} · {format_int(side_records)} reg.", sum(group["pieces"] for group in groups)])
            kinds.append("side-total")
        rows.append(["TOTAL", "", "", f"{format_int(self.total_records)} registros", self.total_pieces])
        kinds.append("total")
        return rows, kinds


def _summary(report: Mapping[str, Any], records: list[Mapping[str, Any]]) -> tuple[list[tuple[str, object]], str]:
    summary = report["summary"]
    side_pieces = {"DE": 0, "EF": 0}
    side_counts = {"DE": 0, "EF": 0}
    for record in records:
        side = str(record["side"])
        if side in side_pieces:
            side_pieces[side] += int(record["quantity"])
            side_counts[side] += 1
    lots_for_conference = int(summary.get("lotsForConference", summary.get("fragmentedLots", 0)))
    rows: list[tuple[str, object]] = [
        ("Total de registros", int(report["totalRecords"])),
        ("Total de peças", int(report["totalPieces"])),
        ("Total de lotes", int(summary["lotsAnalyzed"])),
        ("Total de vãos", len(_bay_groups(records))),
        ("Lotes OK", int(summary.get("lotsOk", summary.get("regularLots", 0)))),
        ("Lotes para conferência", lots_for_conference),
        ("1 peça fora do local principal", int(summary.get("singlePieceOutsideLots", summary.get("loosePieces", 0)))),
        ("Lotes com múltiplas peças fora do local principal", int(summary.get("multiplePiecesOutsideLots", summary.get("displacedGroups", 0)))),
        ("Lotes distribuídos em mais de um local", int(summary.get("distributedLots", summary.get("ambiguousDistributions", 0)))),
        ("Peças lado DE", side_pieces["DE"]),
        ("Peças lado EF", side_pieces["EF"]),
        ("Registros lado DE", side_counts["DE"]),
        ("Registros lado EF", side_counts["EF"]),
    ]
    if _has_reference(report):
        reference = report["reference"]
        rows.extend(
            [
                ("Referência de lotes", "Planilha Excel exportada do SAP / SICLA"),
                ("Lotes previstos", int(reference.get("totalLots", 0))),
                ("Previstos e encontrados", int(reference.get("foundLots", 0))),
                ("Previstos e não encontrados", int(reference.get("missingLots", 0))),
                ("Lotes físicos fora da referência", int(reference.get("outsideReferenceLots", 0))),
                ("Lotes fragmentados (físico)", int(reference.get("fragmentedLots", 0))),
            ]
        )
    if lots_for_conference:
        observation = (
            f"Há {format_int(lots_for_conference)} lote(s) para conferência. "
            "Consulte a seção LOTES PARA CONFERÊNCIA para verificar locais e quantidades."
        )
    else:
        observation = "Nenhum lote precisa de conferência."
    return rows, observation


def _consolidated(report: Mapping[str, Any]) -> tuple[list[list[object]], list[str]]:
    rows: list[list[object]] = []
    kinds: list[str] = []
    for lot in report["lots"]:
        presentation = _presentation(lot)
        requires_conference = bool(presentation["requiresConference"])
        location_summary = "\n".join(
            str(location["display"] if requires_conference else location["label"])
            for location in presentation["locations"]
        ) or "—"
        rows.append([str(lot["lot"]), int(lot["totalQuantity"]), location_summary, str(presentation["situation"])])
        kinds.append(str(presentation.get("tone", "review")))
    return rows, kinds


def _reference_label(lot: Mapping[str, Any]) -> str:
    status = lot.get("referenceStatus")
    if status in {"EXPECTED_FOUND", "EXPECTED_MISSING"}:
        return "Previsto"
    if status == "OUTSIDE_REFERENCE":
        return "Fora da referência"
    return "Sem referência"


def _physical_label(lot: Mapping[str, Any]) -> str:
    return "Encontrado" if lot.get("physicalFound", int(lot.get("totalQuantity", 0)) > 0) else "Não encontrado"


def _conciliation(report: Mapping[str, Any]) -> tuple[list[list[object]], list[str]]:
    rows: list[list[object]] = []
    kinds: list[str] = []
    for lot in report.get("lots", []):
        if not isinstance(lot, Mapping):
            continue
        presentation = _presentation(lot)
        locations = presentation.get("locations", []) if isinstance(presentation, Mapping) else []
        location_summary = "\n".join(
            str(location.get("display") or location.get("label"))
            for location in locations
            if isinstance(location, Mapping)
        ) or "—"
        condition = str(presentation.get("situation", "LOTE PARA CONFERÊNCIA"))
        if lot.get("referenceStatus") == "EXPECTED_MISSING":
            condition = "PREVISTO E NÃO ENCONTRADO"
        elif lot.get("referenceStatus") == "OUTSIDE_REFERENCE":
            condition = f"FORA DA REFERÊNCIA · {condition}"
        rows.append(
            [str(lot["lot"]), _reference_label(lot), _physical_label(lot), location_summary, int(lot.get("totalQuantity", 0)), condition]
        )
        if lot.get("referenceStatus") in {"EXPECTED_MISSING", "OUTSIDE_REFERENCE"}:
            kinds.append("review")
        else:
            kinds.append(str(presentation.get("tone", "review")))
    return rows, kinds


ROUTE_HEADERS = ["Ordem", "Lote", "Total", "Situação", "Local principal", "Outros locais", "Peças fora", "Ação recomendada"]
SIDE_HEADERS = ["Lado", "Registros", "Peças", "Vãos", "Lotes"]


def _route(report: Mapping[str, Any]) -> tuple[list[list[object]], list[str]]:
    """Lotes para conferência na ordem em que o conferente percorre o pátio."""

    pending: list[tuple[tuple[object, ...], list[object], str]] = []
    for lot in report["lots"]:
        presentation = _presentation(lot)
        if not presentation["requiresConference"]:
            continue
        raw_primary = lot.get("primaryLocation")
        raw_locations = [location for location in lot.get("locations", []) if isinstance(location, Mapping)]
        if isinstance(raw_primary, Mapping):
            key: tuple[object, ...] = (0, _route_key(raw_primary))
        elif raw_locations:
            key = (0, min(_route_key(location) for location in raw_locations))
        else:
            key = (1, ())
        primary = presentation.get("primaryLocation")
        out_of_primary = presentation.get("outOfPrimaryQuantity")
        row: list[object] = [
            str(lot["lot"]),
            int(lot["totalQuantity"]),
            str(presentation["situation"]),
            str(primary["display"] if primary else "Não definido"),
            "\n".join(str(location["display"]) for location in presentation.get("otherLocations", [])) or "—",
            int(out_of_primary) if out_of_primary is not None else None,
            str(presentation["action"]),
        ]
        pending.append((key + (_natural_key(str(lot["lot"])),), row, str(presentation["tone"])))
    pending.sort(key=lambda item: item[0])
    rows = [[index, *row] for index, (_, row, _) in enumerate(pending, start=1)]
    return rows, [kind for _, _, kind in pending]


def _location_identity(location: Mapping[str, Any]) -> tuple[str, str, str]:
    return (str(location.get("side", "")), str(location.get("bay", "")), str(location.get("layer") or ""))


def _lot_locations(report: Mapping[str, Any]) -> tuple[list[list[object]], list[str]]:
    """Uma linha por lote e local, com lado, vão e camada em colunas próprias."""

    rows: list[list[object]] = []
    kinds: list[str] = []
    for lot in report["lots"]:
        presentation = _presentation(lot)
        tone = str(presentation.get("tone", "review"))
        raw_primary = lot.get("primaryLocation")
        primary_key = _location_identity(raw_primary) if isinstance(raw_primary, Mapping) else None
        locations = sorted(
            (location for location in lot.get("locations", []) if isinstance(location, Mapping)),
            key=_route_key,
        )
        base = [str(lot["lot"]), str(presentation["situation"]), int(lot["totalQuantity"])]
        if not locations:
            rows.append(base + [None, None, None, 0, "—"])
            kinds.append(tone)
            continue
        for location in locations:
            if tone == "ok":
                primary = "Sim"
            elif primary_key is None:
                primary = "Não definido"
            else:
                primary = "Sim" if _location_identity(location) == primary_key else "Não"
            rows.append(base + [str(location["side"]), str(location["bay"]), location.get("layer") or "—", int(location["quantity"]), primary])
            kinds.append(tone)
    return rows, kinds


def _side_rows(records: list[Mapping[str, Any]], bay_groups: list[dict[str, Any]]) -> list[list[object]]:
    rows: list[list[object]] = []
    for side in SIDE_ORDER:
        side_records = [record for record in records if record["side"] == side]
        rows.append(
            [
                side,
                len(side_records),
                sum(int(record["quantity"]) for record in side_records),
                sum(1 for group in bay_groups if group["side"] == side),
                len({str(record["lot"]) for record in side_records}),
            ]
        )
    return rows


def _bay_map(bay_groups: list[dict[str, Any]]) -> tuple[list[str], list[list[object]]]:
    """Mapa de peças por lado (linhas) e vão (colunas), com totais."""

    columns = sorted({str(group["bay"]) for group in bay_groups}, key=_natural_key)
    pieces = {(group["side"], group["bay"]): int(group["pieces"]) for group in bay_groups}
    rows: list[list[object]] = []
    for side in SIDE_ORDER:
        values = [pieces.get((side, bay)) for bay in columns]
        rows.append([side, *values, sum(value or 0 for value in values)])
    column_totals = [sum(pieces.get((side, bay), 0) for side in SIDE_ORDER) for bay in columns]
    rows.append(["Total", *column_totals, sum(column_totals)])
    return columns, rows


def build_report_view(report: Mapping[str, Any]) -> ReportView:
    """Valida os totais e prepara a apresentação usada por todos os formatos."""

    totals_check = verify_report_totals(report)
    records = [dict(record) for record in report["records"]]
    bay_groups = _bay_groups(records)
    summary, observation = _summary(report, records)
    summary_values = dict(summary)
    consolidated_rows, consolidated_kinds = _consolidated(report)
    route_rows, route_kinds = _route(report)
    has_reference = _has_reference(report)
    conciliation_rows, conciliation_kinds = _conciliation(report) if has_reference else ([], [])
    bay_map_columns, bay_map_rows = _bay_map(bay_groups)
    lot_location_rows, lot_location_kinds = _lot_locations(report)
    review_lots = int(report["summary"].get("reviewLots", 0))
    state_counts = [
        ("1 peça fora do local principal", int(summary_values["1 peça fora do local principal"]), "single-piece"),
        ("Várias peças fora do local principal", int(summary_values["Lotes com múltiplas peças fora do local principal"]), "multiple-pieces"),
        ("Distribuídos em mais de um local", int(summary_values["Lotes distribuídos em mais de um local"]), "distributed"),
    ]
    if review_lots:
        state_counts.append(("Para revisar", review_lots, "review"))
    reference_labels = (
        "Lotes previstos",
        "Previstos e encontrados",
        "Previstos e não encontrados",
        "Lotes físicos fora da referência",
        "Lotes fragmentados (físico)",
    )
    inventory_date = parse_report_date(report["inventoryDate"])
    return ReportView(
        inventory_date=inventory_date,
        inventory_date_label=format_report_date(report["inventoryDate"]),
        revision=int(report["revision"]),
        generated_at_label=format_generated_at(report.get("generatedAt")),
        total_records=int(report["totalRecords"]),
        total_pieces=int(report["totalPieces"]),
        summary=summary,
        observation=observation,
        records=records,
        bay_groups=bay_groups,
        consolidated_rows=consolidated_rows,
        consolidated_kinds=consolidated_kinds,
        has_reference=has_reference,
        totals_check=totals_check,
        lots_ok=int(summary_values["Lotes OK"]),
        lots_for_conference=int(summary_values["Lotes para conferência"]),
        state_counts=state_counts,
        side_rows=_side_rows(records, bay_groups),
        bay_map_columns=bay_map_columns,
        bay_map_rows=bay_map_rows,
        route_rows=route_rows,
        route_kinds=route_kinds,
        reference_summary=[(label, summary_values[label]) for label in reference_labels if label in summary_values],
        lot_location_rows=lot_location_rows,
        lot_location_kinds=lot_location_kinds,
        conciliation_rows=conciliation_rows,
        conciliation_kinds=conciliation_kinds,
    )


EXCEL_FOOTER = "Página &P de &N"
EXCEL_DATE_FORMAT = "DD/MM/YYYY"
EXCEL_THOUSANDS_FORMAT = "#,##0"
EXCEL_NAVY = "003B63"
EXCEL_SECTION_FILL = "DCE3EA"

RECORD_HEADERS = ["Lado", "Vão", "Camada", "Lote", "Quantidade de peças"]
BAY_HEADERS = ["Lado", "Vão", "Registros", "Peças"]
LOT_LOCATION_HEADERS = ["Lote", "Situação", "Total do lote", "Lado", "Vão", "Camada", "Peças no local", "Local principal"]
NO_ROUTE_ROW: list[object] = [None, "—", None, "Nenhum lote para conferência", "—", "—", None, "Nenhum lote precisa de conferência."]


@dataclass(frozen=True)
class ExcelSheet:
    """Uma aba do Excel. O `.xls` e o `.xlsx` renderizam a mesma lista de abas.

    Abas de dados têm o cabeçalho na linha 1; a aba PAINEL é um quadro com
    blocos rotulados. `number_columns` recebem separador de milhar e
    `text_columns` são gravadas como texto (lotes).
    """

    name: str
    rows: list[list[object]]
    kinds: list[str]
    widths: list[int]
    number_columns: frozenset[int] = frozenset()
    text_columns: frozenset[int] = frozenset()
    data: bool = True
    landscape: bool = True


def _excel_panel(view: ReportView) -> ExcelSheet:
    check = view.totals_check
    rows: list[list[object]] = [
        ["Inventário da Laminação de Perfis — relatório de entrega"],
        ["Data do inventário", view.inventory_date or view.inventory_date_label],
        ["Revisão", view.revision],
        ["Gerado em", view.generated_at_label],
        [],
        ["Indicadores"],
        *[[label, value] for label, value in view.summary],
        ["Observações importantes", view.observation],
        [],
        ["Conferência dos totais"],
        ["Verificação", "Peças / registros"],
        ["Soma dos lançamentos", check.records_pieces],
        ["Soma dos lotes", check.lots_pieces],
        ["Total do resumo", check.summary_pieces],
        ["Soma dos subtotais por vão", check.bay_pieces],
        ["Registros: lançados × resumo", f"{format_int(check.records)} × {format_int(check.summary_records)}"],
        ["Resultado", "Confere"],
        [],
        ["Quadro por lado"],
        SIDE_HEADERS,
        *[list(row) for row in view.side_rows],
        [],
        ["Mapa de peças por vão"],
        ["Vão", *SIDE_ORDER, "Total"],
    ]
    kinds = ["title", "label", "label", "label", "blank", "section"]
    kinds += ["label"] * (len(view.summary) + 1)
    kinds += ["blank", "section", "header"] + ["label"] * 6
    kinds += ["blank", "section", "header"] + ["body"] * len(view.side_rows)
    kinds += ["blank", "section", "header"]
    side_values = {row[0]: row[1:-1] for row in view.bay_map_rows}
    totals = {row[0]: row[-1] for row in view.bay_map_rows}
    for index, bay in enumerate(view.bay_map_columns):
        values = [side_values[side][index] for side in SIDE_ORDER]
        rows.append([_bay_value(bay), *values, sum(value or 0 for value in values)])
        kinds.append("body")
    rows.append(["Total", *[totals[side] for side in SIDE_ORDER], totals["Total"]])
    kinds.append("total")
    return ExcelSheet("PAINEL", rows, kinds, [38, 22, 14, 14, 14], number_columns=frozenset({1, 2, 3, 4}), data=False, landscape=False)


def excel_sheets(view: ReportView) -> list[ExcelSheet]:
    """Abas do Excel na ordem de entrega: PAINEL e abas de dados."""

    route_rows = [list(row) for row in view.route_rows] or [list(NO_ROUTE_ROW)]
    route_kinds = list(view.route_kinds) or ["body"]
    records = [
        [record["side"], _bay_value(str(record["bay"])), record.get("layer") or "—", str(record["lot"]), int(record["quantity"])]
        for record in view.records
    ]
    bays = [[group["side"], _bay_value(str(group["bay"])), group["records"], group["pieces"]] for group in view.bay_groups]
    lot_rows = [
        [row[0], row[1], row[2], row[3], _bay_value(str(row[4])) if row[4] else row[4], row[5], row[6], row[7]]
        for row in view.lot_location_rows
    ]
    sheets = [
        _excel_panel(view),
        ExcelSheet(
            "CONFERÊNCIA",
            [ROUTE_HEADERS, *route_rows],
            ["header", *route_kinds],
            [8, 14, 9, 36, 22, 26, 10, 60],
            number_columns=frozenset({2, 6}),
            text_columns=frozenset({1}),
        ),
        ExcelSheet(
            "LANÇAMENTOS",
            [RECORD_HEADERS, *records],
            ["header", *["body"] * len(records)],
            [9, 9, 11, 16, 20],
            number_columns=frozenset({4}),
            text_columns=frozenset({3}),
            landscape=False,
        ),
        ExcelSheet(
            "POR VÃO",
            [BAY_HEADERS, *bays],
            ["header", *["body"] * len(bays)],
            [9, 9, 12, 12],
            number_columns=frozenset({2, 3}),
            landscape=False,
        ),
        ExcelSheet(
            "LOTES",
            [LOT_LOCATION_HEADERS, *lot_rows],
            ["header", *view.lot_location_kinds],
            [14, 36, 13, 8, 8, 10, 14, 15],
            number_columns=frozenset({2, 6}),
            text_columns=frozenset({0}),
        ),
    ]
    if view.has_reference:
        sheets.append(
            ExcelSheet(
                "CONCILIAÇÃO",
                [CONCILIATION_HEADERS, *[list(row) for row in view.conciliation_rows]],
                ["header", *view.conciliation_kinds],
                [14, 20, 16, 40, 12, 46],
                number_columns=frozenset({4}),
                text_columns=frozenset({0}),
            )
        )
    return sheets


def _excel_page_header(view: ReportView) -> str:
    return f"Inventário de {view.inventory_date_label} · Revisão {view.revision}"


def _excel_number_format(sheet: ExcelSheet, column: int, value: object) -> str:
    if isinstance(value, date):
        return EXCEL_DATE_FORMAT
    if column in sheet.text_columns:
        return "@"
    if isinstance(value, int) and column in sheet.number_columns:
        return EXCEL_THOUSANDS_FORMAT
    if isinstance(value, int):
        return "0"
    return "General"


def _excel_line_count(values: list[object], widths: list[int]) -> int:
    """Linhas visuais da célula mais alta, considerando quebras e a largura da coluna."""

    count = 1
    for value, width in zip(values, widths):
        if value is None or isinstance(value, (int, date)):
            continue
        usable = max(width - 2, 1)
        count = max(count, sum(max(1, -(-len(line) // usable)) for line in str(value).split("\n")))
    return count


def _excel_print_scale(sheet: ExcelSheet) -> int:
    """Escala explícita para o BIFF8 caber na largura do A4 (≈95 ou ≈140 caracteres)."""

    printable = 140 if sheet.landscape else 95
    return max(40, min(100, int(100 * printable / sum(sheet.widths))))


def _xlsx_write_sheet(workbook: Workbook, sheet: ExcelSheet, header_text: str) -> Any:
    worksheet = workbook.create_sheet(sheet.name)
    border = Border(*(Side(style="thin", color=GREY_BORDER),) * 4)
    navy = PatternFill("solid", fgColor=EXCEL_NAVY)
    section_fill = PatternFill("solid", fgColor=EXCEL_SECTION_FILL)
    for row_index, (values, kind) in enumerate(zip(sheet.rows, sheet.kinds), start=1):
        fill = None
        font = Font(name="Arial", size=10)
        if kind == "title":
            font = Font(name="Arial", size=14, bold=True, color=EXCEL_NAVY)
        elif kind == "section":
            font = Font(name="Arial", size=11, bold=True, color=EXCEL_NAVY)
        elif kind == "header":
            fill, font = navy, Font(name="Arial", size=10, bold=True, color=WHITE)
        elif kind == "total":
            fill, font = section_fill, Font(name="Arial", size=10, bold=True)
        elif kind in _STATE_FILLS:
            fill = PatternFill("solid", fgColor=_STATE_FILLS[kind])
        for column_index, value in enumerate(values):
            cell = worksheet.cell(row_index, column_index + 1, value)
            cell.font = font
            if kind in {"title", "section", "blank"}:
                continue
            if kind == "label" and column_index == 0:
                cell.font = Font(name="Arial", size=10, bold=True)
            if fill is not None:
                cell.fill = fill
            cell.border = border
            cell.alignment = Alignment(
                horizontal="right" if isinstance(value, (int, date)) and kind != "header" else "left",
                vertical="top",
                wrap_text=True,
            )
            if kind != "header":
                cell.number_format = _excel_number_format(sheet, column_index, value)
        lines = _excel_line_count(values, sheet.widths)
        if lines > 1:
            worksheet.row_dimensions[row_index].height = 13 * lines + 2
    for column_index, width in enumerate(sheet.widths, start=1):
        worksheet.column_dimensions[get_column_letter(column_index)].width = width
    last_letter = get_column_letter(len(sheet.widths))
    if sheet.data:
        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = f"A1:{last_letter}{len(sheet.rows)}"
        worksheet.print_title_rows = "1:1"
    worksheet.sheet_view.showGridLines = False
    worksheet.print_options.gridLines = False
    worksheet.sheet_properties.pageSetUpPr.fitToPage = True
    worksheet.page_setup.paperSize = worksheet.PAPERSIZE_A4
    worksheet.page_setup.orientation = "landscape" if sheet.landscape else "portrait"
    worksheet.page_setup.fitToWidth = 1
    worksheet.page_setup.fitToHeight = 0
    worksheet.page_margins = PageMargins(left=0.4, right=0.4, top=0.6, bottom=0.6, header=0.25, footer=0.25)
    worksheet.oddHeader.left.text = header_text
    worksheet.oddFooter.center.text = EXCEL_FOOTER
    worksheet.print_area = f"A1:{last_letter}{len(sheet.rows)}"
    return worksheet


def _xlsx_add_bay_chart(worksheet: Any, sheet: ExcelSheet) -> None:
    """Gráfico de peças por vão e lado na aba PAINEL (extra exclusivo do .xlsx)."""

    header_row = next(index for index, row in enumerate(sheet.rows, start=1) if row[:1] == ["Vão"])
    last_bay_row = len(sheet.rows) - 1
    chart = BarChart()
    chart.type = "col"
    chart.grouping = "clustered"
    chart.title = "Peças por vão"
    chart.y_axis.title = "Peças"
    chart.x_axis.title = "Vão"
    chart.height = 9
    chart.width = 22
    data = Reference(worksheet, min_col=2, max_col=1 + len(SIDE_ORDER), min_row=header_row, max_row=last_bay_row)
    categories = Reference(worksheet, min_col=1, min_row=header_row + 1, max_row=last_bay_row)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(categories)
    worksheet.add_chart(chart, "G2")


def generate_xlsx_report(report: dict[str, Any]) -> bytes:
    """Gera o relatório moderno em XLSX usando valores calculados no backend."""

    view = build_report_view(report)
    workbook = Workbook()
    workbook.remove(workbook.active)
    header_text = _excel_page_header(view)
    for sheet in excel_sheets(view):
        worksheet = _xlsx_write_sheet(workbook, sheet, header_text)
        if sheet.name == "PAINEL":
            _xlsx_add_bay_chart(worksheet, sheet)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_xlsx(report: dict[str, Any]) -> bytes:
    """Compatibilidade para o nome público usado pelo backend atual."""

    return generate_xlsx_report(report)


# Cores próprias gravadas na paleta do arquivo BIFF8 (índices livres 0x21+),
# para o .xls ter os mesmos tons do .xlsx, do PDF e do Word.
_XLS_PALETTE = {
    "report_navy": (0x21, EXCEL_NAVY),
    "report_section": (0x22, EXCEL_SECTION_FILL),
    "report_yellow": (0x23, ALERT_YELLOW),
    "report_orange": (0x24, ALERT_ORANGE),
    "report_red": (0x25, ALERT_RED),
}
_XLS_BORDER = "borders: left thin, right thin, top thin, bottom thin, left_colour grey25, right_colour grey25, top_colour grey25, bottom_colour grey25;"
_XLS_STYLE_SPECS = {
    "title": "font: name Arial, height 280, bold on, colour report_navy;",
    "section": "font: name Arial, height 220, bold on, colour report_navy;",
    "header": f"font: name Arial, height 200, bold on, colour white; pattern: pattern solid, fore_colour report_navy; align: vert top, wrap on; {_XLS_BORDER}",
    "label": f"font: name Arial, height 200, bold on; align: vert top, wrap on; {_XLS_BORDER}",
    "body": f"font: name Arial, height 200; align: vert top, wrap on; {_XLS_BORDER}",
    "total": f"font: name Arial, height 200, bold on; pattern: pattern solid, fore_colour report_section; align: vert top, wrap on; {_XLS_BORDER}",
    "single-piece": f"font: name Arial, height 200; pattern: pattern solid, fore_colour report_yellow; align: vert top, wrap on; {_XLS_BORDER}",
    "multiple-pieces": f"font: name Arial, height 200; pattern: pattern solid, fore_colour report_orange; align: vert top, wrap on; {_XLS_BORDER}",
    "review": f"font: name Arial, height 200; pattern: pattern solid, fore_colour report_orange; align: vert top, wrap on; {_XLS_BORDER}",
    "distributed": f"font: name Arial, height 200; pattern: pattern solid, fore_colour report_red; align: vert top, wrap on; {_XLS_BORDER}",
}


class _XlsStyles:
    """Cache de estilos BIFF8 por tipo de linha, formato e alinhamento."""

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str, bool], xlwt.XFStyle] = {}

    def get(self, name: str, number_format: str = "General", right: bool = False) -> xlwt.XFStyle:
        key = (name, number_format, right)
        if key not in self._cache:
            spec = _XLS_STYLE_SPECS.get(name, _XLS_STYLE_SPECS["body"])
            if right:
                spec = spec.replace("align: vert top", "align: horiz right, vert top")
            self._cache[key] = xlwt.easyxf(spec, num_format_str=number_format)
        return self._cache[key]


def _xls_write_sheet(workbook: xlwt.Workbook, styles: _XlsStyles, sheet: ExcelSheet, header_text: str) -> None:
    worksheet = workbook.add_sheet(sheet.name)
    for row_index, (values, kind) in enumerate(zip(sheet.rows, sheet.kinds)):
        for column_index, value in enumerate(values):
            if kind in {"title", "section", "blank"}:
                worksheet.write(row_index, column_index, value, styles.get(kind if kind != "blank" else "section"))
                continue
            style_name = "label" if kind == "label" and column_index == 0 else ("body" if kind == "label" else kind)
            if kind == "header":
                worksheet.write(row_index, column_index, value, styles.get("header"))
                continue
            number_format = _excel_number_format(sheet, column_index, value)
            if number_format == "@":
                value = str(value)
            worksheet.write(
                row_index,
                column_index,
                value,
                styles.get(style_name, number_format, isinstance(value, (int, date))),
            )
        lines = _excel_line_count(values, sheet.widths)
        if lines > 1:
            worksheet.row(row_index).height_mismatch = True
            worksheet.row(row_index).height = min(2400, 255 * lines + 30)
    for column_index, width in enumerate(sheet.widths):
        worksheet.col(column_index).width = min(width * 256, 65535)
    if sheet.data:
        worksheet.set_panes_frozen(True)
        worksheet.set_horz_split_pos(1)
        worksheet.set_vert_split_pos(0)
    worksheet.show_grid = False
    worksheet.print_grid = False
    worksheet.set_portrait(not sheet.landscape)
    worksheet.set_paper_size_code(9)  # A4 no catálogo BIFF8.
    worksheet.set_fit_width_to_pages(1)
    worksheet.set_fit_height_to_pages(0)
    worksheet.set_print_scaling(_excel_print_scale(sheet))
    # O setter público do xlwt tenta decodificar `str` no Python 3 e falha;
    # o campo interno recebe o texto já em Unicode, como os valores padrão.
    worksheet._Worksheet__header_str = f"&L{header_text}"
    worksheet._Worksheet__footer_str = f"&C{EXCEL_FOOTER}"


def generate_xls_report(report: dict[str, Any]) -> bytes:
    """Gera diretamente um workbook BIFF8/Excel 97-2003, sem conversão."""

    view = build_report_view(report)
    workbook = xlwt.Workbook(encoding="utf-8")
    for name, (index, rgb) in _XLS_PALETTE.items():
        xlwt.add_palette_colour(name, index)
        workbook.set_colour_RGB(index, int(rgb[0:2], 16), int(rgb[2:4], 16), int(rgb[4:6], 16))
    styles = _XlsStyles()
    header_text = _excel_page_header(view)
    for sheet in excel_sheets(view):
        _xls_write_sheet(workbook, styles, sheet, header_text)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_xls(report: dict[str, Any]) -> bytes:
    """Compatibilidade para o nome público do gerador legado."""

    return generate_xls_report(report)


def _display(value: object) -> str:
    """Texto de célula para PDF e Word: inteiros com milhar e vazio como travessão."""

    if value is None or value == "":
        return "—"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return format_int(value)
    return str(value)


def _display_rows(rows: list[list[object]], *, keep_blank: bool = False) -> list[list[str]]:
    """Converte linhas para texto; `keep_blank` mantém vazias as células de subtotal e do mapa."""

    return [["" if keep_blank and value in ("", None) else _display(value) for value in row] for row in rows]


# PDF e Word: navy só nos cabeçalhos, cor apenas para estado. Lote OK não tem cor.
NAVY = "003B63"
NAVY_RGB = RGBColor(0x00, 0x3B, 0x63)
MUTED = "4F5B66"
RULE = "C9D1D9"
SUBTOTAL_FILL = "EEF1F4"
SIDE_TOTAL_FILL = "DCE3EA"
_STATE_FILLS = {
    "single-piece": ALERT_YELLOW,
    "multiple-pieces": ALERT_ORANGE,
    "distributed": ALERT_RED,
    "review": ALERT_ORANGE,
}
_DOC_ROW_FILLS = {**_STATE_FILLS, "subtotal": SUBTOTAL_FILL, "side-total": SIDE_TOTAL_FILL, "total": NAVY}
_DOC_BOLD_KINDS = {"subtotal", "side-total", "total"}

GROUPED_HEADERS = ["Lado", "Vão", "Camada", "Lote", "Peças"]
ANNEX_HEADERS = ["Lote", "Peças", "Localização", "Situação"]
ROUTE_NOTE = "Ordem de trajeto no pátio: lado EF e depois DE, vãos e camadas em ordem crescente."
REFERENCE_NOTE = (
    "A referência usa somente números de lote da planilha Excel exportada do SAP / SICLA. "
    "As quantidades abaixo são exclusivamente físicas."
)
SECTION_TITLES = (
    "1. Painel",
    "2. Lotes para conferência",
    "3. Lançamentos por lado e vão",
    "4. Anexo: lotes consolidados",
    "5. Conciliação com referência de lotes",
)


def _status_line(view: ReportView) -> str:
    return f"{format_int(view.lots_ok)} lotes OK × {format_int(view.lots_for_conference)} para conferência"


def _kpis(view: ReportView) -> list[tuple[str, str]]:
    return [
        ("Registros", format_int(view.total_records)),
        ("Peças", format_int(view.total_pieces)),
        ("Lotes", format_int(int(dict(view.summary)["Total de lotes"]))),
        ("Vãos", format_int(len(view.bay_groups))),
    ]


def _check_rows(view: ReportView) -> list[list[str]]:
    return [[label, value] for label, value in view.totals_check.rows()] + [["Resultado", "Confere"]]


def _map_rows(view: ReportView) -> tuple[list[str], list[list[str]], list[str]]:
    headers = ["Lado", *view.bay_map_columns, "Total"]
    rows = _display_rows(view.bay_map_rows, keep_blank=True)
    return headers, rows, ["body"] * (len(rows) - 1) + ["side-total"]


def _pdf_value(value: object) -> str:
    return escape(str(value)).replace("\n", "<br/>")


def _pdf_table(
    rows: list[list[object]],
    widths: list[float],
    row_kinds: list[str] | None = None,
    *,
    font_size: float = 8,
    padding: float = 3,
    numeric: set[int] | None = None,
) -> Table:
    """Tabela com cabeçalho navy repetido; fundo só para estado, subtotal e total."""

    numeric = numeric or set()
    base = ParagraphStyle(
        "report-cell",
        fontName="Helvetica",
        fontSize=font_size,
        leading=font_size + 2,
        alignment=TA_LEFT,
        splitLongWords=0,
    )
    styles = {
        (bold, white, right): ParagraphStyle(
            f"report-cell-{bold}-{white}-{right}",
            parent=base,
            fontName="Helvetica-Bold" if bold else "Helvetica",
            textColor=colors.white if white else colors.black,
            alignment=TA_RIGHT if right else TA_LEFT,
        )
        for bold in (False, True)
        for white in (False, True)
        for right in (False, True)
    }
    kinds = ["header"] + list(row_kinds or ["body"] * (len(rows) - 1))
    rendered = []
    for row_index, row in enumerate(rows):
        kind = kinds[row_index] if row_index < len(kinds) else "body"
        bold = kind in _DOC_BOLD_KINDS or kind == "header"
        white = kind in {"header", "total"}
        rendered.append(
            [
                Paragraph(_pdf_value(value), styles[(bold, white, column_index in numeric)])
                for column_index, value in enumerate(row)
            ]
        )
    table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{NAVY}")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(f"#{RULE}")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor(f"#{RULE}")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
    ]
    for row_index, kind in enumerate(kinds[1:], start=1):
        fill = _DOC_ROW_FILLS.get(kind)
        if fill:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor(f"#{fill}")))
    table.setStyle(TableStyle(commands))
    return table


class _NumberedCanvas(pdf_canvas.Canvas):
    """Adia o rodapé até conhecer o total de páginas (Página X de Y)."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - API do ReportLab
        self._page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._page_states)
        for state in self._page_states:
            self.__dict__.update(state)
            page_width = self._pagesize[0]
            self.saveState()
            self.setFont("Helvetica", 7)
            self.setFillColor(colors.HexColor(f"#{NAVY}"))
            self.drawRightString(page_width - 1.3 * cm, 0.75 * cm, f"Página {self._pageNumber} de {total}")
            self.restoreState()
            super().showPage()
        super().save()


# Espaço mínimo para um título seguido do cabeçalho e das primeiras linhas da tabela.
_PDF_HEADING_MIN_SPACE = 3.2 * cm
_PDF_MARGIN = 1.3 * cm
_PDF_COLUMN_GAP = 0.6 * cm


class _ReportDocTemplate(BaseDocTemplate):
    """A4 horizontal com página de coluna única e página de duas colunas."""

    def __init__(self, buffer: BytesIO, view: ReportView) -> None:
        super().__init__(
            buffer,
            pagesize=landscape(A4),
            leftMargin=_PDF_MARGIN,
            rightMargin=_PDF_MARGIN,
            topMargin=1.6 * cm,
            bottomMargin=1.2 * cm,
            title="Relatório de Inventário",
        )
        self._header_right = f"Inventário de {view.inventory_date_label} · Revisão {view.revision}"
        column = (self.width - _PDF_COLUMN_GAP) / 2
        frame_options = {"leftPadding": 0, "rightPadding": 0, "topPadding": 0, "bottomPadding": 0}
        single = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="single", **frame_options)
        left = Frame(self.leftMargin, self.bottomMargin, column, self.height, id="left", **frame_options)
        right = Frame(self.leftMargin + column + _PDF_COLUMN_GAP, self.bottomMargin, column, self.height, id="right", **frame_options)
        self.addPageTemplates(
            [
                PageTemplate(id="one", frames=[single], onPage=self._decorate),
                PageTemplate(id="two", frames=[left, right], onPage=self._decorate),
            ]
        )

    def _decorate(self, canvas: Any, document: Any) -> None:
        page_width, page_height = document.pagesize
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor(f"#{RULE}"))
        canvas.line(document.leftMargin, page_height - 1.25 * cm, page_width - document.rightMargin, page_height - 1.25 * cm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor(f"#{NAVY}"))
        canvas.drawString(document.leftMargin, page_height - 0.95 * cm, "INVENTÁRIO · RELATÓRIO DE ENTREGA")
        canvas.drawRightString(page_width - document.rightMargin, page_height - 0.95 * cm, self._header_right)
        canvas.restoreState()


def _pdf_kpi_table(view: ReportView, width: float) -> Table:
    label_style = ParagraphStyle("kpi-label", fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor(f"#{MUTED}"))
    value_style = ParagraphStyle("kpi-value", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor(f"#{NAVY}"))
    cells = [[Paragraph(label, label_style), Paragraph(value, value_style)] for label, value in _kpis(view)]
    table = Table([cells], colWidths=[width / len(cells)] * len(cells), hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(f"#{NAVY}")),
                ("LINEAFTER", (0, 0), (-2, -1), 0.4, colors.HexColor(f"#{RULE}")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _pdf_state_table(view: ReportView, width: float) -> Table:
    style = ParagraphStyle("state", fontName="Helvetica", fontSize=8, leading=10)
    cells = [Paragraph(f"<b>{format_int(view.lots_ok)}</b> lotes OK", style)] + [
        Paragraph(f"<b>{format_int(count)}</b> {escape(label)}", style) for label, count, _ in view.state_counts
    ]
    table = Table([cells], colWidths=[width / len(cells)] * len(cells), hAlign="LEFT")
    commands: list[tuple[Any, ...]] = [
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor(f"#{RULE}")),
        ("LINEAFTER", (0, 0), (-2, -1), 0.4, colors.HexColor(f"#{RULE}")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for index, (_, count, kind) in enumerate(view.state_counts, start=1):
        if count:
            commands.append(("BACKGROUND", (index, 0), (index, 0), colors.HexColor(f"#{_STATE_FILLS[kind]}")))
    table.setStyle(TableStyle(commands))
    return table


def export_pdf(report: dict[str, Any]) -> bytes:
    view = build_report_view(report)
    buffer = BytesIO()
    document = _ReportDocTemplate(buffer, view)
    width = document.width
    column = (width - _PDF_COLUMN_GAP) / 2
    title_style = ParagraphStyle("report-title", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor(f"#{NAVY}"))
    subtitle_style = ParagraphStyle("report-subtitle", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor(f"#{MUTED}"), spaceAfter=4)
    heading_style = ParagraphStyle("report-heading", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor(f"#{NAVY}"), spaceBefore=6, spaceAfter=5, keepWithNext=1)
    subheading_style = ParagraphStyle("report-subheading", parent=heading_style, fontSize=9.5, leading=12, spaceBefore=4, spaceAfter=3)
    status_style = ParagraphStyle("report-status", fontName="Helvetica-Bold", fontSize=10, leading=13, spaceBefore=6, spaceAfter=3)
    note_style = ParagraphStyle("report-note", fontName="Helvetica", fontSize=8.5, leading=11, spaceBefore=4, spaceAfter=4)

    def heading(text: str) -> list[Any]:
        return [CondPageBreak(_PDF_HEADING_MIN_SPACE), Paragraph(escape(text), heading_style)]

    side_table = _pdf_table([SIDE_HEADERS] + _display_rows(view.side_rows), [2.0 * cm] + [2.4 * cm] * 4, numeric={1, 2, 3, 4})
    check_table = _pdf_table([["Conferência dos totais", "Peças / registros"]] + _check_rows(view), [6.6 * cm, 4.2 * cm], numeric={1})
    map_headers, map_rows, map_kinds = _map_rows(view)
    map_label = 1.6 * cm
    map_cell = (width - map_label) / (len(map_headers) - 1)
    story: list[Any] = [
        Paragraph("Inventário da Laminação de Perfis", title_style),
        Paragraph(escape(view.generated_line), subtitle_style),
        *heading(SECTION_TITLES[0]),
        _pdf_kpi_table(view, width),
        Paragraph(escape(_status_line(view)), status_style),
        _pdf_state_table(view, width),
        Spacer(1, 0.3 * cm),
        Table(
            [[
                [Paragraph("Quadro por lado", subheading_style), side_table],
                [Paragraph("Conferência dos totais", subheading_style), check_table],
            ]],
            colWidths=[12.2 * cm, width - 12.2 * cm],
            hAlign="LEFT",
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]),
        ),
        Paragraph("Mapa de peças por lado e vão", subheading_style),
        _pdf_table([map_headers] + map_rows, [map_label] + [map_cell] * (len(map_headers) - 1), map_kinds, font_size=7.5, padding=2, numeric=set(range(1, len(map_headers)))),
    ]
    if view.reference_summary:
        story.extend(
            [
                Paragraph("Referência de lotes (SAP / SICLA)", subheading_style),
                _pdf_table(
                    [["Indicador", "Lotes"]] + [[label, _display(value)] for label, value in view.reference_summary],
                    [8.0 * cm, 3.0 * cm],
                    numeric={1},
                ),
            ]
        )
    story.append(Paragraph(escape(view.observation), note_style))

    story.extend([PageBreak(), Paragraph(escape(SECTION_TITLES[1]), heading_style), Paragraph(ROUTE_NOTE, note_style)])
    if view.route_rows:
        story.append(
            _pdf_table(
                [ROUTE_HEADERS] + _display_rows(view.route_rows),
                [1.2 * cm, 2.0 * cm, 1.3 * cm, 4.2 * cm, 3.4 * cm, 4.2 * cm, 1.5 * cm, width - 17.8 * cm],
                view.route_kinds,
                numeric={0, 2, 6},
            )
        )
    else:
        story.append(Paragraph("Nenhum lote precisa de conferência.", note_style))

    grouped_rows, grouped_kinds = view.grouped_rows()
    story.extend(
        [
            NextPageTemplate("two"),
            PageBreak(),
            Paragraph(escape(SECTION_TITLES[2]), heading_style),
            _pdf_table(
                [GROUPED_HEADERS] + _display_rows(grouped_rows, keep_blank=True),
                [1.2 * cm, 1.2 * cm, 1.6 * cm, column - 6.0 * cm, 2.0 * cm],
                grouped_kinds,
                font_size=7.5,
                padding=1.4,
                numeric={4},
            ),
            PageBreak(),
            Paragraph(escape(SECTION_TITLES[3]), heading_style),
            _pdf_table(
                [ANNEX_HEADERS] + _display_rows(view.consolidated_rows),
                [2.1 * cm, 1.3 * cm, column - 7.6 * cm, 4.2 * cm],
                view.consolidated_kinds,
                font_size=7.5,
                padding=1.4,
                numeric={1},
            ),
        ]
    )
    if view.has_reference:
        story.extend(
            [
                NextPageTemplate("one"),
                PageBreak(),
                Paragraph(escape(SECTION_TITLES[4]), heading_style),
                Paragraph(REFERENCE_NOTE, note_style),
                _pdf_table(
                    [CONCILIATION_HEADERS] + _display_rows(view.conciliation_rows),
                    [2.0 * cm, 3.0 * cm, 2.6 * cm, 10.2 * cm, 2.5 * cm, width - 20.3 * cm],
                    view.conciliation_kinds,
                    numeric={4},
                ),
            ]
        )
    document.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()


def _docx_set_shading(cell: Any, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:val"), "clear")
    shading.set(qn("w:fill"), fill)


def _docx_set_row_flags(row: Any, *, header: bool = False) -> None:
    """Repete o cabeçalho em cada página e impede linha partida entre páginas."""

    properties = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    cant_split.set(qn("w:val"), "true")
    properties.append(cant_split)
    if header:
        repeat = OxmlElement("w:tblHeader")
        repeat.set(qn("w:val"), "true")
        properties.append(repeat)


def _docx_cell_text(
    cell: Any,
    value: object,
    *,
    bold: bool = False,
    white: bool = False,
    right: bool = False,
    size: float = 7.5,
) -> None:
    cell.text = ""
    lines = str(value).split("\n")
    paragraph = cell.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT if right else WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    for index, line in enumerate(lines):
        run = paragraph.add_run(line)
        run.font.name = "Arial"
        run.font.size = Pt(size)
        run.font.bold = bold
        if white:
            run.font.color.rgb = RGBColor(255, 255, 255)
        if index < len(lines) - 1:
            run.add_break()


def _docx_set_widths(table: Any, widths: list[float]) -> None:
    """Grava a largura na grade e nas células: Word e LibreOffice leem lugares diferentes."""

    table.autofit = False
    for index, width in enumerate(widths):
        table.columns[index].width = Cm(width)
        for cell in table.columns[index].cells:
            cell.width = Cm(width)


def _docx_add_table(
    container: Any,
    headers: list[str],
    rows: list[list[str]],
    widths: list[float],
    *,
    row_kinds: list[str] | None = None,
    numeric: set[int] | None = None,
    size: float = 7.5,
) -> Any:
    """Tabela com cabeçalho navy repetido; fundo só para estado, subtotal e total."""

    numeric = numeric or set()
    table = container.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    _docx_set_row_flags(table.rows[0], header=True)
    for column_index, header in enumerate(headers):
        cell = table.rows[0].cells[column_index]
        cell.width = Cm(widths[column_index])
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        _docx_set_shading(cell, NAVY)
        _docx_cell_text(cell, header, bold=True, white=True, right=column_index in numeric, size=size)
    kinds = row_kinds or ["body"] * len(rows)
    for row_offset, values in enumerate(rows):
        kind = kinds[row_offset]
        row = table.add_row()
        _docx_set_row_flags(row)
        fill = _DOC_ROW_FILLS.get(kind)
        for column_index, value in enumerate(values):
            cell = row.cells[column_index]
            cell.width = Cm(widths[column_index])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
            if fill:
                _docx_set_shading(cell, fill)
            _docx_cell_text(
                cell,
                value,
                bold=kind in _DOC_BOLD_KINDS,
                white=kind == "total",
                right=column_index in numeric,
                size=size,
            )
    _docx_set_widths(table, widths)
    return table


def _docx_add_field(paragraph: Any, instruction_text: str) -> None:
    run = paragraph.add_run()
    run.font.name = "Arial"
    run.font.size = Pt(8)
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = f" {instruction_text} "
    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")
    run._r.append(field_begin)
    run._r.append(instruction)
    run._r.append(field_end)


def _docx_add_text(paragraph: Any, text: str, *, size: float = 8, bold: bool = False, color: RGBColor | None = None) -> Any:
    run = paragraph.add_run(text)
    run.font.name = "Arial"
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    return run


def _docx_add_page_field(paragraph: Any) -> None:
    _docx_add_text(paragraph, "Página ")
    _docx_add_field(paragraph, "PAGE")
    _docx_add_text(paragraph, " de ")
    _docx_add_field(paragraph, "NUMPAGES")


def _docx_paragraph(container: Any, text: str = "", *, size: float = 8.5, bold: bool = False, color: RGBColor | None = None, after: float = 3) -> Any:
    paragraph = container.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(after)
    if text:
        _docx_add_text(paragraph, text, size=size, bold=bold, color=color)
    return paragraph


def _docx_heading(container: Any, text: str, *, size: float = 12, before: float = 6) -> Any:
    paragraph = container.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(4)
    paragraph.paragraph_format.keep_with_next = True
    _docx_add_text(paragraph, text, size=size, bold=True, color=NAVY_RGB)
    return paragraph


def _docx_set_columns(section: Any, count: int, space_cm: float = 0.6) -> None:
    properties = section._sectPr
    columns = properties.find(qn("w:cols"))
    if columns is None:
        columns = OxmlElement("w:cols")
        properties.append(columns)
    columns.set(qn("w:num"), str(count))
    columns.set(qn("w:space"), str(int(space_cm * 567)))


def _docx_layout_table(document: Document, widths: list[float]) -> Any:
    """Tabela invisível usada só para dispor blocos lado a lado."""

    table = document.add_table(rows=1, cols=len(widths))
    _docx_set_widths(table, widths)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "nil")
        borders.append(element)
    table._tbl.tblPr.append(borders)
    for cell in table.rows[0].cells:
        cell.paragraphs[0].paragraph_format.space_after = Pt(0)
    return table


def _docx_kpis(document: Document, view: ReportView, width: float) -> None:
    kpis = _kpis(view)
    table = document.add_table(rows=1, cols=len(kpis))
    table.style = "Table Grid"
    table.autofit = False
    for index, (label, value) in enumerate(kpis):
        cell = table.rows[0].cells[index]
        cell.width = Cm(width / len(kpis))
        cell.text = ""
        label_paragraph = cell.paragraphs[0]
        label_paragraph.paragraph_format.space_after = Pt(0)
        _docx_add_text(label_paragraph, label, size=8, color=RGBColor(0x4F, 0x5B, 0x66))
        value_paragraph = cell.add_paragraph()
        value_paragraph.paragraph_format.space_after = Pt(2)
        _docx_add_text(value_paragraph, value, size=18, bold=True, color=NAVY_RGB)
    _docx_set_widths(table, [width / len(kpis)] * len(kpis))


def _docx_states(document: Document, view: ReportView, width: float) -> None:
    cells = [(f"{format_int(view.lots_ok)} lotes OK", None)] + [
        (f"{format_int(count)} {label}", _STATE_FILLS[kind] if count else None) for label, count, kind in view.state_counts
    ]
    table = document.add_table(rows=1, cols=len(cells))
    table.style = "Table Grid"
    table.autofit = False
    for index, (text, fill) in enumerate(cells):
        cell = table.rows[0].cells[index]
        cell.width = Cm(width / len(cells))
        if fill:
            _docx_set_shading(cell, fill)
        _docx_cell_text(cell, text, size=8)
    _docx_set_widths(table, [width / len(cells)] * len(cells))


def export_docx(report: dict[str, Any]) -> bytes:
    view = build_report_view(report)
    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.4)
    section.bottom_margin = Cm(1.2)
    section.left_margin = Cm(1.2)
    section.right_margin = Cm(1.2)
    section.header_distance = Cm(0.6)
    section.footer_distance = Cm(0.6)
    width = 29.7 - 2.4
    column = (width - 0.6) / 2
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.LEFT
    _docx_add_text(header, f"INVENTÁRIO · RELATÓRIO DE ENTREGA · Inventário de {view.inventory_date_label} · Revisão {view.revision}", size=7.5, color=NAVY_RGB)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _docx_add_page_field(footer)
    document.core_properties.title = "Relatório de Inventário"

    _docx_paragraph(document, "Inventário da Laminação de Perfis", size=17, bold=True, color=NAVY_RGB, after=2)
    _docx_paragraph(document, view.generated_line, size=9, color=RGBColor(0x4F, 0x5B, 0x66), after=4)
    _docx_heading(document, SECTION_TITLES[0], before=2)
    _docx_kpis(document, view, width)
    _docx_paragraph(document, _status_line(view), size=10, bold=True, after=2).paragraph_format.space_before = Pt(5)
    _docx_states(document, view, width)
    layout = _docx_layout_table(document, [12.6, width - 12.6])
    left, right = layout.rows[0].cells
    _docx_heading(left, "Quadro por lado", size=9.5, before=6)
    _docx_add_table(left, SIDE_HEADERS, _display_rows(view.side_rows), [2.0, 2.4, 2.4, 2.4, 2.4], numeric={1, 2, 3, 4})
    _docx_heading(right, "Conferência dos totais", size=9.5, before=6)
    _docx_add_table(right, ["Conferência dos totais", "Peças / registros"], _check_rows(view), [6.6, 4.2], numeric={1})
    map_headers, map_rows, map_kinds = _map_rows(view)
    _docx_heading(document, "Mapa de peças por lado e vão", size=9.5, before=6)
    map_cell = (width - 1.6) / (len(map_headers) - 1)
    _docx_add_table(document, map_headers, map_rows, [1.6] + [map_cell] * (len(map_headers) - 1), row_kinds=map_kinds, numeric=set(range(1, len(map_headers))), size=7)
    if view.reference_summary:
        _docx_heading(document, "Referência de lotes (SAP / SICLA)", size=9.5, before=6)
        _docx_add_table(document, ["Indicador", "Lotes"], [[label, _display(value)] for label, value in view.reference_summary], [8.0, 3.0], numeric={1})
    _docx_paragraph(document, view.observation).paragraph_format.space_before = Pt(5)

    document.add_page_break()
    _docx_heading(document, SECTION_TITLES[1], before=0)
    _docx_paragraph(document, ROUTE_NOTE)
    if view.route_rows:
        _docx_add_table(
            document,
            ROUTE_HEADERS,
            _display_rows(view.route_rows),
            [1.2, 2.1, 1.3, 4.2, 3.4, 4.2, 1.5, width - 17.9],
            row_kinds=view.route_kinds,
            numeric={0, 2, 6},
        )
    else:
        _docx_paragraph(document, "Nenhum lote precisa de conferência.")

    columns_section = document.add_section(WD_SECTION.NEW_PAGE)
    _docx_set_columns(columns_section, 2)
    grouped_rows, grouped_kinds = view.grouped_rows()
    _docx_heading(document, SECTION_TITLES[2], before=0)
    _docx_add_table(
        document,
        GROUPED_HEADERS,
        _display_rows(grouped_rows, keep_blank=True),
        [1.2, 1.2, 1.6, column - 6.0, 2.0],
        row_kinds=grouped_kinds,
        numeric={4},
    )
    document.add_page_break()
    _docx_heading(document, SECTION_TITLES[3], before=0)
    _docx_add_table(
        document,
        ANNEX_HEADERS,
        _display_rows(view.consolidated_rows),
        [2.1, 1.3, column - 7.6, 4.2],
        row_kinds=view.consolidated_kinds,
        numeric={1},
    )
    if view.has_reference:
        reference_section = document.add_section(WD_SECTION.NEW_PAGE)
        _docx_set_columns(reference_section, 1)
        _docx_heading(document, SECTION_TITLES[4], before=0)
        _docx_paragraph(document, REFERENCE_NOTE)
        _docx_add_table(
            document,
            CONCILIATION_HEADERS,
            _display_rows(view.conciliation_rows),
            [2.0, 3.0, 2.6, 10.2, 2.5, width - 20.3],
            row_kinds=view.conciliation_kinds,
            numeric={4},
        )
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()
