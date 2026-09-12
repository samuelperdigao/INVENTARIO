import { HistoryDetail } from "@/components/history-detail";

export default async function HistoryDetailPage({ params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params;
  return <HistoryDetail inventoryId={inventoryId} />;
}
