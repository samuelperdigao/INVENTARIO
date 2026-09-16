import type { AnalysisClassification, AnalysisLocation, LotPresentation, PresentationLocation } from "@/lib/models";

interface LotLocationsProps {
  locations: AnalysisLocation[];
  classification: AnalysisClassification;
  presentation?: LotPresentation;
}

export function formatLotLocation(location: AnalysisLocation, classification: AnalysisClassification): string {
  const name = `${location.side} ${location.bay}${location.layer ? ` · ${location.layer}` : ""}`;
  return classification === "OK" ? name : `${name} · ${location.quantity} pç`;
}

export function LotLocations({ locations, classification, presentation }: LotLocationsProps) {
  if (locations.length === 0) return <span className="lot-locations-empty">—</span>;

  const presentedLocations: PresentationLocation[] = presentation?.locations?.length
    ? presentation.locations
    : locations.map((location) => ({
      label: `${location.side} ${location.bay}${location.layer ? ` · ${location.layer}` : ""}`,
      display: formatLotLocation(location, classification),
      quantity: location.quantity,
      isPrimary: false,
    }));
  const showQuantity = presentation?.requiresConference ?? classification !== "OK";

  return (
    <ul className="lot-location-list" aria-label="Locais do lote">
      {presentedLocations.map((location, index) => {
        const label = showQuantity ? location.display : location.label;

        return (
          <li
            className="lot-location"
            key={`${location.label}-${index}`}
            aria-label={label}
          >
            <span className="lot-location-name">{location.label}</span>
            {showQuantity ? (
              <>
                <span className="lot-location-separator" aria-hidden="true">·</span>
                <span className="lot-location-quantity">{location.quantity} pç</span>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
