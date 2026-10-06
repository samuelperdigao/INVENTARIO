import { InventoryEntriesScreen } from "@/components/inventory-entries-screen";

export default async function InventoryEntriesPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  return <InventoryEntriesScreen inventoryId={inventoryId} />;
}
