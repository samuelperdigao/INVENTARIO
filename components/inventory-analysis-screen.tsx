"use client";

import { AnalysisPanel } from "@/components/analysis-panel";
import { InventorySubpageShell, InventorySubpageLoading, InventorySubpageUnavailable } from "@/components/inventory-subpage-shell";
import { useLocalInventory } from "@/components/use-local-inventory";

export function InventoryAnalysisScreen({ inventoryId }: { inventoryId: string }) {
  const { inventory, entries, loading, error } = useLocalInventory(inventoryId);

  if (loading) return <InventorySubpageLoading label="Abrindo análise" />;
  if (!inventory) return <InventorySubpageUnavailable error={error} />;

  return (
    <InventorySubpageShell inventory={inventory} eyebrow="Consolidação inteligente" title="Análise" description="Veja o resultado completo dos lançamentos, com a situação de cada lote e as recomendações de conferência.">
      <AnalysisPanel inventory={inventory} entries={entries} />
    </InventorySubpageShell>
  );
}
