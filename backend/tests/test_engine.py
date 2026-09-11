from app.engine import AnalysisEntry, analyze_entries


def entry(side: str, bay: str, lot: str, quantity: int) -> AnalysisEntry:
    return AnalysisEntry(side=side, bay=bay, lot=lot, quantity=quantity)  # type: ignore[arg-type]


def single_lot(*entries: AnalysisEntry) -> dict[str, object]:
    report = analyze_entries("00000000-0000-7000-8000-000000000001", 4, entries)
    return report["lots"][0]  # type: ignore[index]


def test_one_location_is_ok() -> None:
    result = single_lot(entry("EF", "01", "0012", 8))
    assert result["classification"] == "OK"
    assert result["fragmented"] is False
    assert result["totalQuantity"] == 8


def test_19_plus_1_is_loose_piece_with_primary_location() -> None:
    result = single_lot(entry("DE", "15", "2815634434", 19), entry("EF", "21", "2815634434", 1))
    assert result["classification"] == "PEÇA_SOLTEIRA"
    assert result["fragmented"] is True
    assert result["primaryLocation"] == {"side": "DE", "bay": "15", "quantity": 19}
    assert result["displacedQuantity"] == 1


def test_15_plus_5_is_displaced_group() -> None:
    result = single_lot(entry("DE", "08", "L", 15), entry("EF", "11", "L", 5))
    assert result["classification"] == "GRUPO_DESLOCADO"
    assert result["displacedQuantity"] == 5


def test_15_plus_2_plus_3_is_displaced_group() -> None:
    result = single_lot(entry("DE", "08", "L", 15), entry("EF", "11", "L", 2), entry("DE", "20", "L", 3))
    assert result["classification"] == "GRUPO_DESLOCADO"
    assert result["displacedQuantity"] == 5


def test_tie_and_11_plus_9_are_ambiguous() -> None:
    tie = single_lot(entry("EF", "1", "T", 10), entry("DE", "1", "T", 10))
    near = single_lot(entry("EF", "1", "N", 11), entry("DE", "1", "N", 9))
    assert tie["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"
    assert near["classification"] == "DISTRIBUIÇÃO_AMBÍGUA"


def test_same_lot_same_location_is_consolidated_and_locations_are_ordered() -> None:
    report = analyze_entries(
        "00000000-0000-7000-8000-000000000001",
        1,
        [
            entry("DE", "10", "10", 2),
            entry("EF", "2", "10", 1),
            entry("EF", "2", "10", 4),
            entry("EF", "11", "2", 3),
        ],
    )
    first_lot = report["lots"][0]  # type: ignore[index]
    assert first_lot["lot"] == "2"
    lot_ten = report["lots"][1]  # type: ignore[index]
    assert lot_ten["locations"] == [
        {"side": "EF", "bay": "2", "quantity": 5},
        {"side": "DE", "bay": "10", "quantity": 2},
    ]

