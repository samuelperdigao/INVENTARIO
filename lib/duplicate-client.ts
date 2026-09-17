import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedSession } from "@/lib/auth-client";
import { isValidLot, normalizeLot } from "@/lib/lot-rules";
import type { Inventory, InventoryEntry } from "@/lib/models";

type RemoteEntry = Omit<InventoryEntry, "syncStatus" | "syncBaseRevision"> & { syncBaseRevision: number };

export async function findRemoteDuplicateLotEntries(
  inventory: Inventory,
  lot: string,
  excludeEntryId?: string,
): Promise<InventoryEntry[]> {
  const normalizedLot = normalizeLot(lot);
  if (!isValidLot(normalizedLot)) return [];
  if (typeof navigator !== "undefined" && !navigator.onLine) return [];
  try {
    const session = await getAuthenticatedSession();
    const params = new URLSearchParams();
    if (excludeEntryId) params.set("excludeEntryId", excludeEntryId);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/lots/${encodeURIComponent(normalizedLot)}${query}`, {
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
