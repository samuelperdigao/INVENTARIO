"""Regras determinísticas de análise, independentes de HTTP e persistência."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Iterable, Literal

Side = Literal["EF", "DE"]
Classification = Literal[
    "OK",
    "PEÇA_SOLTEIRA",
    "GRUPO_DESLOCADO",
    "DISTRIBUIÇÃO_AMBÍGUA",
    "REVISAR",
]


@dataclass(frozen=True)
class AnalysisEntry:
    """Dados já validados pela borda da aplicação."""

    side: Side
    bay: str
    lot: str
    quantity: int
    layer: str | None = None


def _natural_key(value: str) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def _location_sort_key(location: tuple[str, str, str]) -> tuple[int, list[object], list[object]]:
    side, bay, layer = location
    return (0 if side == "EF" else 1, _natural_key(bay), _natural_key(layer))


def _location_label(location: dict[str, object]) -> str:
    layer = location.get("layer")
    suffix = f" · Camada {layer}" if layer else ""
    return f"{location['side']} · Vão {location['bay']}{suffix}"


def analyze_entries(inventory_id: str, revision: int, entries: Iterable[AnalysisEntry]) -> dict[str, object]:
    """Consolida os locais e aplica as regras de classificação do contrato."""

    quantities: dict[str, dict[tuple[str, str, str], int]] = defaultdict(lambda: defaultdict(int))
    for entry in entries:
        lot = entry.lot.strip()
        location = (entry.side, entry.bay.strip(), (entry.layer or "").strip())
        quantities[lot][location] += entry.quantity

    lots: list[dict[str, object]] = []
    summary = {
        "lotsAnalyzed": 0,
        "regularLots": 0,
        "fragmentedLots": 0,
        "loosePieces": 0,
        "displacedGroups": 0,
        "ambiguousDistributions": 0,
        "reviewItems": 0,
    }

    for lot in sorted(quantities, key=_natural_key):
        locations = [
            {"side": side, "bay": bay, "layer": layer or None, "quantity": quantity}
            for (side, bay, layer), quantity in sorted(quantities[lot].items(), key=lambda item: _location_sort_key(item[0]))
        ]
        total_quantity = sum(location["quantity"] for location in locations)
        fragmented = len(locations) > 1
        classification: Classification = "OK"
        primary_location: dict[str, object] | None = None
        displaced_quantity = 0
        recommendation: str | None = None

        if fragmented:
            summary["fragmentedLots"] += 1
            ordered_by_quantity = sorted(locations, key=lambda location: int(location["quantity"]), reverse=True)
            candidate = ordered_by_quantity[0]
            is_unique_largest = len(ordered_by_quantity) == 1 or candidate["quantity"] > ordered_by_quantity[1]["quantity"]
            others_quantity = total_quantity - int(candidate["quantity"])
            has_reliable_primary = is_unique_largest and int(candidate["quantity"]) >= 3 * others_quantity
            if has_reliable_primary:
                primary_location = candidate
                displaced_quantity = others_quantity
                if displaced_quantity == 1:
                    classification = "PEÇA_SOLTEIRA"
                    summary["loosePieces"] += 1
                    recommendation = (
                        f"Sugestão: verificar a possibilidade de reunir a peça fora de {_location_label(candidate)}."
                    )
                else:
                    classification = "GRUPO_DESLOCADO"
                    summary["displacedGroups"] += 1
                    recommendation = (
                        f"Sugestão: verificar a possibilidade de reunir as {displaced_quantity} peça(s) fora de {_location_label(candidate)}."
                    )
            else:
                classification = "DISTRIBUIÇÃO_AMBÍGUA"
                summary["ambiguousDistributions"] += 1
        else:
            summary["regularLots"] += 1

        lots.append(
            {
                "lot": lot,
                "totalQuantity": total_quantity,
                "locations": locations,
                "fragmented": fragmented,
                "classification": classification,
                "primaryLocation": primary_location,
                "displacedQuantity": displaced_quantity,
                "recommendation": recommendation,
            }
        )
        summary["lotsAnalyzed"] += 1

    return {
        "inventoryId": inventory_id,
        "revision": revision,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lots": lots,
        "summary": summary,
    }
