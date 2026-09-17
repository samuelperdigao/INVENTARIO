import pytest

from app.lot_rules import LOT_VALIDATION_MESSAGE, is_valid_lot, validate_lot
from app.schemas import AnalysisPreviewRequest


@pytest.mark.parametrize(
    "lot",
    [
        "2712345678",
        "2812345678",
    ],
)
def test_official_lot_formats_are_valid(lot: str) -> None:
    assert is_valid_lot(lot)
    assert validate_lot(lot) == lot


@pytest.mark.parametrize(
    "lot",
    [
        "2612345678",
        "2912345678",
        "281234567",
        "28123456789",
        "28A2345678",
        "28-2345678",
        "",
    ],
)
def test_other_lot_formats_are_invalid(lot: str) -> None:
    assert not is_valid_lot(lot)
    with pytest.raises(ValueError, match="10 números"):
        validate_lot(lot)


def test_backend_contract_applies_the_same_lot_rule_directly() -> None:
    request = AnalysisPreviewRequest.model_validate(
        {
            "inventory": {"id": "00000000-0000-7000-8000-000000000001", "date": "2026-09-17", "revision": 1},
            "entries": [
                {
                    "id": "00000000-0000-7000-8000-000000000002",
                    "side": "EF",
                    "bay": "1",
                    "lot": " 2712345678\u200b",
                    "quantity": 1,
                }
            ],
        }
    )
    assert request.entries[0].lot == "2712345678"

    with pytest.raises(ValueError, match=LOT_VALIDATION_MESSAGE):
        AnalysisPreviewRequest.model_validate(
            {
                "inventory": {"id": "00000000-0000-7000-8000-000000000001", "date": "2026-09-17", "revision": 1},
                "entries": [
                    {
                        "id": "00000000-0000-7000-8000-000000000002",
                        "side": "EF",
                        "bay": "1",
                        "lot": "271234567",
                        "quantity": 1,
                    }
                ],
            }
        )
