import type { AnalysisClassification, AnalysisLocation } from "@/lib/models";

interface LotLocationsProps {
  locations: AnalysisLocation[];
  classification: AnalysisClassification;
}

export function formatLotLocation(location: AnalysisLocation, classification: AnalysisClassification): string {
  const name = `${location.side} ${location.bay}`;
  return classification === "OK" ? name : `${name} · ${location.quantity} pç`;
}

export function LotLocations({ locations, classification }: LotLocationsProps) {
  if (locations.length === 0) return <span className="lot-locations-empty">—</span>;

  const showQuantity = classification !== "OK";

  return (
    <ul className="lot-location-list" aria-label="Locais do lote">
      {locations.map((location, index) => {
        const name = `${location.side} ${location.bay}`;
        const label = formatLotLocation(location, classification);

        return (
          <li
            className="lot-location"
            key={`${location.side}-${location.bay}-${location.layer ?? "sem-camada"}-${index}`}
            aria-label={label}
          >
            <span className="lot-location-name">{name}</span>
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
