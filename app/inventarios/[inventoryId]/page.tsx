import { InventoryScreen } from "@/components/inventory-screen";

export default async function InventoryPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  return <InventoryScreen inventoryId={inventoryId} />;
}

