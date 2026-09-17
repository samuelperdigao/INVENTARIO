import { describe, expect, it } from "vitest";

import {
  isValidLot,
  LOT_VALIDATION_MESSAGE,
  normalizeLot,
  sanitizeLotInput,
  validateLot,
} from "@/lib/lot-rules";

describe("regra oficial de lotes", () => {
  it.each(["2712345678", "2812345678"])("aceita %s", (lot) => {
    expect(isValidLot(lot)).toBe(true);
    expect(validateLot(lot)).toBeUndefined();
  });

  it.each(["2612345678", "2912345678", "271234567", "27123456789", "27A2345678", "27-2345678"])("rejeita %s", (lot) => {
    expect(isValidLot(lot)).toBe(false);
    expect(validateLot(lot)).toBe(LOT_VALIDATION_MESSAGE);
  });

  it("normaliza somente bordas e caracteres invisíveis conhecidos", () => {
    expect(normalizeLot(" 2712345678\u200b")).toBe("2712345678");
    expect(isValidLot(" 2712345678\u200b")).toBe(true);
  });

  it("mantém apenas dígitos ASCII e limita o campo a dez posições", () => {
    expect(sanitizeLotInput("a٢271234567890b")).toBe("2712345678");
  });
});
