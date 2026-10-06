import { InventoryAnalysisScreen } from "@/components/inventory-analysis-screen";

export default async function InventoryAnalysisPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  return <InventoryAnalysisScreen inventoryId={inventoryId} />;
}
