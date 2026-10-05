import { expect, it } from "vitest";

import {
  isFragmentedLocationCount,
  lotRequiresConference,
  lotSituation,
  lotTone,
  resolveLotPresentation,
} from "@/lib/lot-classification";
import type { LotPresentation } from "@/lib/models";

it("prioriza a apresentação operacional calculada pela API", () => {
  const presentation: LotPresentation = {
    situation: "1 PEÇA FORA DO LOCAL PRINCIPAL",
    tone: "single-piece",
    requiresConference: true,
    primaryLocation: { label: "LP 15", display: "LP 15 · 19 pç", quantity: 19, isPrimary: true },
    otherLocations: [{ label: "LE 21", display: "LE 21 · 1 pç", quantity: 1, isPrimary: false }],
    locations: [
      { label: "LP 15", display: "LP 15 · 19 pç", quantity: 19, isPrimary: true },
      { label: "LE 21", display: "LE 21 · 1 pç", quantity: 1, isPrimary: false },
    ],
    outOfPrimaryQuantity: 1,
    action: "Conferir a peça localizada em LE 21.",
  };
  const lot = { classification: "PEÇA_SOLTEIRA" as const, presentation };

  expect(resolveLotPresentation(lot)).toBe(presentation);
  expect(lotSituation(lot)).toBe("1 PEÇA FORA DO LOCAL PRINCIPAL");
  expect(lotTone(lot)).toBe("single-piece");
  expect(lotRequiresConference(lot)).toBe(true);
});

it("mantém um fallback genérico apenas para caches antigos", () => {
  const ok = { classification: "OK" as const };
  const review = { classification: "REVISAR" as const };

  expect(resolveLotPresentation(ok)).toMatchObject({
    situation: "OK",
    tone: "ok",
    requiresConference: false,
  });
  expect(resolveLotPresentation(review)).toMatchObject({
    situation: "LOTE PARA CONFERÊNCIA",
    tone: "review",
    requiresConference: true,
  });
});

it("mantém no cache offline a fronteira de mais de um local", () => {
  expect(isFragmentedLocationCount(0)).toBe(false);
  expect(isFragmentedLocationCount(1)).toBe(false);
  expect(isFragmentedLocationCount(2)).toBe(true);
});
