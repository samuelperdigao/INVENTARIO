import type { LotAnalysis, LotPresentation, PresentationTone } from "@/lib/models";

type PresentableLot = Pick<LotAnalysis, "classification" | "presentation">;

function fallbackPresentation(lot: PresentableLot): LotPresentation {
  const isOk = lot.classification === "OK";
  return {
    situation: isOk ? "OK" : "LOTE PARA CONFERÊNCIA",
    tone: isOk ? "ok" : "review",
    requiresConference: !isOk,
    primaryLocation: null,
    otherLocations: [],
    locations: [],
    outOfPrimaryQuantity: isOk ? 0 : null,
    action: isOk ? "Nenhuma ação necessária." : "Conferir fisicamente o lote.",
  };
}

/**
 * Consome a apresentação calculada pela API. O fallback é apenas de
 * compatibilidade para caches antigos e nunca recalcula a classificação.
 */
export function resolveLotPresentation(lot: PresentableLot): LotPresentation {
  return lot.presentation ?? fallbackPresentation(lot);
}

export function lotSituation(lot: PresentableLot): string {
  return resolveLotPresentation(lot).situation;
}

export function lotTone(lot: PresentableLot): PresentationTone {
  return resolveLotPresentation(lot).tone;
}

export function lotRequiresConference(lot: PresentableLot): boolean {
  return resolveLotPresentation(lot).requiresConference;
}

/** Mantém a fronteira offline equivalente ao motor Python: mais de um local. */
export function isFragmentedLocationCount(locationCount: number): boolean {
  return locationCount > 1;
}
