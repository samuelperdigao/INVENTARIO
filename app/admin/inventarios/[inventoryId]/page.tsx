import { AdminPanel } from "@/components/admin-panel";

export default async function AdminInventoryPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  return <AdminPanel inventoryId={inventoryId} />;
}
