/** Regra única de lote compartilhada pelo lançamento e pela referência SAP. */

export const LOT_LENGTH = 10;
export const LOT_PREFIXES = ["27", "28"] as const;
export const LOT_VALIDATION_MESSAGE = "O lote deve ter 10 números e começar por 27 ou 28.";

const INVISIBLE_CHARS = ["\u200b", "\u200c", "\u200d", "\ufeff"] as const;

export function normalizeLot(value: string): string {
  return INVISIBLE_CHARS.reduce((result, character) => result.replaceAll(character, ""), value).trim();
}

function isAsciiDigit(value: string): boolean {
  return value >= "0" && value <= "9";
}

export function isValidLot(value: string): boolean {
  const normalized = normalizeLot(value);
  return (
    normalized.length === LOT_LENGTH
    && LOT_PREFIXES.includes(normalized.slice(0, 2) as (typeof LOT_PREFIXES)[number])
    && [...normalized.slice(2)].every(isAsciiDigit)
  );
}

export function validateLot(value: string): string | undefined {
  const normalized = normalizeLot(value);
  if (!normalized) return "Informe o lote.";
  return isValidLot(normalized) ? undefined : LOT_VALIDATION_MESSAGE;
}

export function sanitizeLotInput(value: string): string {
  return [...value].filter(isAsciiDigit).slice(0, LOT_LENGTH).join("");
}
