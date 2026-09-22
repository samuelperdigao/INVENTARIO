import { formatSideLabel, type AnalysisClassification, type AnalysisLocation, type LotPresentation, type PresentationLocation } from "@/lib/models";

interface LotLocationsProps {
  locations: AnalysisLocation[];
  classification: AnalysisClassification;
  presentation?: LotPresentation;
}

function formatPresentedSide(value: string): string {
  const side = value.slice(0, 2);
  return (side === "EF" || side === "DE") && value[2] === " " ? formatSideLabel(side) + value.slice(2) : value;
}

export function formatLotLocation(location: AnalysisLocation, classification: AnalysisClassification): string {
  const name = `${formatSideLabel(location.side)} ${location.bay}${location.layer ? ` · ${location.layer}` : ""}`;
  return classification === "OK" ? name : `${name} · ${location.quantity} pç`;
}

export function LotLocations({ locations, classification, presentation }: LotLocationsProps) {
  if (locations.length === 0) return <span className="lot-locations-empty">—</span>;

  const presentedLocations: PresentationLocation[] = presentation?.locations?.length
    ? presentation.locations.map((location) => ({ ...location, label: formatPresentedSide(location.label), display: formatPresentedSide(location.display), }))
    : locations.map((location) => ({
      label: `${formatSideLabel(location.side)} ${location.bay}${location.layer ? ` · ${location.layer}` : ""}`,
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
