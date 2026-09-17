"""Camada de apresentação operacional dos resultados do motor.

O motor mantém os códigos determinísticos usados pelos contratos internos.
Este módulo traduz esses códigos para a linguagem que o operador encontra no
histórico e nos relatórios, sem recalcular a regra de negócio.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal, Mapping


PresentationTone = Literal["ok", "single-piece", "multiple-pieces", "distributed", "review"]


def _location_key(location: Mapping[str, Any] | None) -> tuple[str, str, str] | None:
    if not location:
        return None
    return (
        str(location.get("side", "")),
        str(location.get("bay", "")),
        str(location.get("layer") or ""),
    )


def format_physical_location(location: Mapping[str, Any] | None) -> str:
    """Formata um local no padrão operacional visível."""

    if not location:
        return "Não definido"
    label = f"{location['side']} {location['bay']}"
    layer = location.get("layer")
    return f"{label} · {layer}" if layer else label


def format_location_with_quantity(location: Mapping[str, Any] | None) -> str:
    """Formata um local com sua quantidade física."""

    if not location:
        return "Não definido"
    return f"{format_physical_location(location)} · {int(location['quantity'])} pç"


def _presentation_location(location: Mapping[str, Any], *, is_primary: bool) -> dict[str, Any]:
    return {
        "label": format_physical_location(location),
        "display": format_location_with_quantity(location),
        "quantity": int(location["quantity"]),
        "isPrimary": is_primary,
    }


def build_lot_presentation(lot: Mapping[str, Any]) -> dict[str, Any]:
    """Traduz uma análise de lote para os campos usados pelo operador."""

    classification = str(lot.get("classification", "REVISAR"))
    if lot.get("referenceStatus") == "EXPECTED_MISSING":
        return {
            "situation": "PREVISTO E NÃO ENCONTRADO",
            "tone": "review",
            "requiresConference": True,
            "primaryLocation": None,
            "otherLocations": [],
            "locations": [],
            "outOfPrimaryQuantity": None,
            "action": "Nenhum lançamento físico foi encontrado para este lote previsto.",
        }
    raw_locations = [location for location in lot.get("locations", []) if isinstance(location, Mapping)]
    internal_primary = lot.get("primaryLocation")
    primary_key = _location_key(internal_primary if isinstance(internal_primary, Mapping) else None)
    locations = [
        _presentation_location(location, is_primary=primary_key is not None and _location_key(location) == primary_key)
        for location in raw_locations
    ]
    if primary_key is not None:
        locations = [location for location in locations if location["isPrimary"]] + [
            location for location in locations if not location["isPrimary"]
        ]

    # Um lote OK não recebe local principal do motor, mas seu único local é o
    # local completo para a apresentação. Isso não muda o contrato interno.
    if classification == "OK":
        if locations:
            locations[0]["isPrimary"] = True
        primary = locations[0] if locations else None
        return {
            "situation": "OK",
            "tone": "ok",
            "requiresConference": False,
            "primaryLocation": primary,
            "otherLocations": [],
            "locations": locations,
            "outOfPrimaryQuantity": 0,
            "action": "Nenhuma ação necessária.",
        }

    if classification in {"PEÇA_SOLTEIRA", "GRUPO_DESLOCADO"} and primary_key is not None:
        primary = next((location for location in locations if location["isPrimary"]), None)
        other_locations = [location for location in locations if not location["isPrimary"]]
        displaced_quantity = int(lot.get("displacedQuantity") or 0)
        if classification == "PEÇA_SOLTEIRA":
            situation = "1 PEÇA FORA DO LOCAL PRINCIPAL"
            tone: PresentationTone = "single-piece"
            other_labels = " / ".join(str(location["label"]) for location in other_locations) or "outro local"
            action = f"Conferir a peça localizada em {other_labels}."
        else:
            situation = f"{displaced_quantity} PEÇAS FORA DO LOCAL PRINCIPAL"
            tone = "multiple-pieces"
            primary_label = str(primary["label"]) if primary else "local principal"
            action = f"Conferir as {displaced_quantity} peças encontradas fora de {primary_label}."
        return {
            "situation": situation,
            "tone": tone,
            "requiresConference": True,
            "primaryLocation": primary,
            "otherLocations": other_locations,
            "locations": locations,
            "outOfPrimaryQuantity": displaced_quantity,
            "action": action,
        }

    if classification == "DISTRIBUIÇÃO_AMBÍGUA":
        situation = "LOTE DISTRIBUÍDO EM MAIS DE UM LOCAL"
        tone = "distributed"
        action = "Conferir fisicamente o lote. Não foi identificado um local principal com segurança."
    else:
        situation = "LOTE PARA CONFERÊNCIA"
        tone = "review"
        action = "Conferir fisicamente o lote."

    for location in locations:
        location["isPrimary"] = False
    return {
        "situation": situation,
        "tone": tone,
        "requiresConference": True,
        "primaryLocation": None,
        "otherLocations": locations,
        "locations": locations,
        "outOfPrimaryQuantity": None,
        "action": action,
    }


def apply_report_presentation(report: Mapping[str, Any]) -> dict[str, Any]:
    """Anexa a apresentação operacional e mantém os campos antigos intactos.

    A cópia também permite normalizar snapshots finalizados antes desta
    camada existir, sem modificar o JSON persistido durante uma simples
    leitura.
    """

    presented = deepcopy(dict(report))
    lots = [dict(lot) for lot in presented.get("lots", []) if isinstance(lot, Mapping)]
    tones: list[str] = []
    for lot in lots:
        presentation = build_lot_presentation(lot)
        lot["presentation"] = presentation
        tones.append(str(presentation["tone"]))
    presented["lots"] = lots

    summary = dict(presented.get("summary") or {})
    summary.update(
        {
            "lotsOk": tones.count("ok"),
            "lotsForConference": len(tones) - tones.count("ok"),
            "singlePieceOutsideLots": tones.count("single-piece"),
            "multiplePiecesOutsideLots": tones.count("multiple-pieces"),
            "distributedLots": tones.count("distributed"),
            "reviewLots": tones.count("review"),
        }
    )
    presented["summary"] = summary
    return presented
