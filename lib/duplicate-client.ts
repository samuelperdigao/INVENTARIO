import { getAuthenticatedSession } from "@/lib/auth-client";
import type { Inventory, InventoryEntry } from "@/lib/models";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

type RemoteEntry = Omit<InventoryEntry, "syncStatus" | "syncBaseRevision"> & { syncBaseRevision: number };

export async function findRemoteDuplicateLotEntries(
  inventory: Inventory,
  lot: string,
  excludeEntryId?: string,
): Promise<InventoryEntry[]> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return [];
  try {
    const session = await getAuthenticatedSession();
    const params = new URLSearchParams();
    if (excludeEntryId) params.set("excludeEntryId", excludeEntryId);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/lots/${encodeURIComponent(lot)}${query}`, {
      method: "GET",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Inventory-Sync-Token": inventory.syncToken,
      },
    });
    if (!response.ok) return [];
    const records = await response.json() as RemoteEntry[];
    return records.map((record) => ({ ...record, syncStatus: "SYNCED", syncBaseRevision: record.revision }));
  } catch {
    // A checagem central é um reforço online. O lançamento local continua
    // disponível sem rede e ainda aplica a verificação do IndexedDB.
    return [];
  }
}
