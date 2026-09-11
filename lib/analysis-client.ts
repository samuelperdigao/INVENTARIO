import { db } from "@/lib/db";
import type { AnalysisCache, AnalysisReport, Inventory, InventoryEntry } from "@/lib/models";

const analysisBaseUrl = process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

export async function getCachedReport(inventoryId: string, revision: number): Promise<AnalysisCache | undefined> {
  const exact = await db.analysisCache.where("[inventoryId+revision]").equals([inventoryId, revision]).first();
  if (exact) return exact;
  const cachedReports = await db.analysisCache.where("inventoryId").equals(inventoryId).toArray();
  return cachedReports.sort((left, right) => right.cachedAt.localeCompare(left.cachedAt))[0];
}

export async function requestAnalysis(inventory: Inventory, entries: InventoryEntry[]): Promise<AnalysisReport> {
  const response = await fetch(`${analysisBaseUrl}/api/v1/analysis/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inventory: { id: inventory.id, date: inventory.date, revision: inventory.revision },
      entries: entries.map(({ id, side, bay, lot, quantity }) => ({ id, side, bay, lot, quantity })),
    }),
  });
  if (!response.ok) throw new Error("Não foi possível gerar a análise agora.");
  const report = (await response.json()) as AnalysisReport;
  await db.analysisCache.put({
    id: `${inventory.id}:${inventory.revision}`,
    inventoryId: inventory.id,
    revision: inventory.revision,
    report,
    cachedAt: new Date().toISOString(),
  });
  return report;
}
