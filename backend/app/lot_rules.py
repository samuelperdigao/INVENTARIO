"""Regra única para identificação e validação de números de lote."""

from __future__ import annotations

from typing import Annotated

from pydantic import BeforeValidator


LOT_LENGTH = 10
LOT_PREFIXES: tuple[str, ...] = ("27", "28")
LOT_VALIDATION_MESSAGE = "O lote deve ter 10 números e começar por 27 ou 28."

_INVISIBLE_CHARS = ("\u200b", "\u200c", "\u200d", "\ufeff")


def normalize_lot(value: object) -> str:
    """Normaliza apenas espaços externos e caracteres invisíveis seguros.

    A função é deliberadamente estrita quanto ao tipo: contratos HTTP e dados
    persistidos devem transportar o lote como texto, nunca como número que
    possa sofrer conversão implícita ou perda de precisão.
    """

    if not isinstance(value, str):
        raise ValueError(LOT_VALIDATION_MESSAGE)
    normalized = value.strip()
    for character in _INVISIBLE_CHARS:
        normalized = normalized.replace(character, "")
    return normalized.strip()


def is_valid_lot(value: object) -> bool:
    """Retorna se o valor segue exatamente a regra oficial vigente."""

    try:
        normalized = normalize_lot(value)
    except ValueError:
        return False
    return (
        len(normalized) == LOT_LENGTH
        and normalized[:2] in LOT_PREFIXES
        and all("0" <= character <= "9" for character in normalized[2:])
    )


def validate_lot(value: object) -> str:
    """Retorna o lote normalizado ou levanta um erro de domínio."""

    normalized = normalize_lot(value)
    if not is_valid_lot(normalized):
        raise ValueError(LOT_VALIDATION_MESSAGE)
    return normalized


LotNumber = Annotated[str, BeforeValidator(validate_lot)]
