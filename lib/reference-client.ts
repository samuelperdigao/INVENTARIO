import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedSession } from "@/lib/auth-client";
import { db } from "@/lib/db";
import { listActiveEntries } from "@/lib/inventory-repository";
import type {
  Inventory,
  InventoryReference,
  LocalReferenceLot,
  ReferenceImportSummary,
  ReferenceLotItem,
  ReferencePreview,
  ReferenceState,
  ReferenceSummary,
} from "@/lib/models";

interface ApiReferenceMetadata {
  sourceType: "SAP_EXCEL";
  originalFilename: string;
  importedAt: string;
  updatedAt: string;
  totalLots: number;
  revision: number;
  createdByName?: string;
}

interface ApiReferenceState {
  reference: ApiReferenceMetadata | null;
  summary: ReferenceSummary;
  lots: ReferenceLotItem[];
  page: number;
  pageSize: number;
  totalMatchingLots: number;
  totalPages: number;
}

interface ApiImportResponse {
  reference: ApiReferenceMetadata;
  importSummary: ReferenceImportSummary;
  lotNumbers: string[];
}

function emptySummary(): ReferenceSummary {
  return {
    available: false,
    totalLots: 0,
    foundLots: 0,
    pendingLots: 0,
    outsideReferenceLots: 0,
    fragmentedLots: 0,
    physicalDistinctLots: 0,
  };
}

function localReference(inventoryId: string, metadata: ApiReferenceMetadata, lotsComplete: boolean): InventoryReference {
  return {
    id: inventoryId,
    inventoryId,
    sourceType: metadata.sourceType,
    originalFilename: metadata.originalFilename,
    importedAt: metadata.importedAt,
    updatedAt: metadata.updatedAt,
    totalLots: metadata.totalLots,
    revision: metadata.revision,
    createdByName: metadata.createdByName,
    status: "ACTIVE",
    lotsComplete,
  };
}

async function errorFromResponse(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => undefined) as { detail?: string } | undefined;
  return new Error(body?.detail ?? fallback);
}

async function authorizedHeaders(inventory: Inventory): Promise<Record<string, string>> {
  const session = await getAuthenticatedSession();
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Inventory-Sync-Token": inventory.syncToken,
  };
}

async function requestReferenceFile(
  inventory: Inventory,
  path: string,
  file: File,
  columnIndex?: number,
): Promise<Response> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (columnIndex != null) form.append("columnIndex", String(columnIndex));
  return fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: await authorizedHeaders(inventory),
    body: form,
  });
}

export async function previewReference(inventory: Inventory, file: File, columnIndex?: number): Promise<ReferencePreview> {
  const response = await requestReferenceFile(
    inventory,
    `/api/v1/inventories/${inventory.id}/reference/preview`,
    file,
    columnIndex,
  );
  if (!response.ok) throw await errorFromResponse(response, "Não foi possível ler a planilha Excel.");
  return response.json() as Promise<ReferencePreview>;
}

async function persistReferenceMetadata(inventoryId: string, metadata: ApiReferenceMetadata, lotsComplete: boolean): Promise<void> {
  const current = await db.inventoryReferences.get(inventoryId);
  const sameRevision = current?.revision === metadata.revision;
  await db.transaction("rw", db.inventoryReferences, db.referenceLots, async () => {
    if (!sameRevision) await db.referenceLots.where("inventoryId").equals(inventoryId).delete();
    await db.inventoryReferences.put(localReference(inventoryId, metadata, sameRevision ? current?.lotsComplete ?? lotsComplete : lotsComplete));
  });
}

async function persistImportedReference(inventoryId: string, metadata: ApiReferenceMetadata, lotNumbers: string[]): Promise<void> {
  await db.transaction("rw", db.inventoryReferences, db.referenceLots, async () => {
    await db.referenceLots.where("inventoryId").equals(inventoryId).delete();
    await db.inventoryReferences.put(localReference(inventoryId, metadata, true));
    const records: LocalReferenceLot[] = lotNumbers.map((lotNumber) => ({
      id: `${inventoryId}:${lotNumber}`,
      inventoryId,
      lotNumber,
    }));
    for (let offset = 0; offset < records.length; offset += 1_000) {
      await db.referenceLots.bulkPut(records.slice(offset, offset + 1_000));
    }
  });
}

async function clearLocalReference(inventoryId: string): Promise<void> {
  await db.transaction("rw", db.inventoryReferences, db.referenceLots, async () => {
    await db.referenceLots.where("inventoryId").equals(inventoryId).delete();
    await db.inventoryReferences.delete(inventoryId);
  });
}

export async function importReference(
  inventory: Inventory,
  file: File,
  columnIndex: number,
): Promise<{ importSummary: ReferenceImportSummary; reference: InventoryReference }> {
  const response = await requestReferenceFile(
    inventory,
    `/api/v1/inventories/${inventory.id}/reference`,
    file,
    columnIndex,
  );
  if (!response.ok) throw await errorFromResponse(response, "Não foi possível importar a referência de lotes.");
  const result = await response.json() as ApiImportResponse;
  await persistImportedReference(inventory.id, result.reference, result.lotNumbers);
  return {
    importSummary: result.importSummary,
    reference: localReference(inventory.id, result.reference, true),
  };
}

async function fetchReferenceState(inventory: Inventory, page: number, query: string): Promise<ReferenceState> {
  const params = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (query.trim()) params.set("query", query.trim());
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/reference?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: await authorizedHeaders(inventory),
  });
  if (!response.ok) throw await errorFromResponse(response, "Não foi possível carregar a referência de lotes.");
  const result = await response.json() as ApiReferenceState;
  if (!result.reference) {
    await clearLocalReference(inventory.id);
    return { ...result, reference: undefined };
  }
  await persistReferenceMetadata(inventory.id, result.reference, false);
  const cached = await db.inventoryReferences.get(inventory.id);
  return {
    ...result,
    reference: cached ?? localReference(inventory.id, result.reference, false),
  };
}

function physicalStats(entries: Awaited<ReturnType<typeof listActiveEntries>>): Map<string, { quantity: number; occurrences: number; locations: Set<string> }> {
  const stats = new Map<string, { quantity: number; occurrences: number; locations: Set<string> }>();
  for (const entry of entries) {
    const current = stats.get(entry.lot) ?? { quantity: 0, occurrences: 0, locations: new Set<string>() };
    current.quantity += entry.quantity;
    current.occurrences += 1;
    current.locations.add(`${entry.side}:${entry.bay}:${entry.layer ?? ""}`);
    stats.set(entry.lot, current);
  }
  return stats;
}

async function localReferenceState(inventoryId: string, page: number, query: string): Promise<ReferenceState> {
  const metadata = await db.inventoryReferences.get(inventoryId);
  if (!metadata || metadata.status !== "ACTIVE") {
    return { reference: undefined, summary: emptySummary(), lots: [], page: 1, pageSize: 50, totalMatchingLots: 0, totalPages: 0 };
  }
  const entries = await listActiveEntries(inventoryId);
  const physical = physicalStats(entries);
  const cachedLots = metadata.lotsComplete
    ? await db.referenceLots.where("inventoryId").equals(inventoryId).toArray()
    : [];
  const referenceLots = new Set(cachedLots.map((lot) => lot.lotNumber));
  const physicalLots = new Set(physical.keys());
  const matching = cachedLots
    .filter((lot) => !query.trim() || lot.lotNumber.includes(query.trim()))
    .sort((left, right) => left.lotNumber.localeCompare(right.lotNumber));
  const totalPages = matching.length ? Math.ceil(matching.length / 50) : 0;
  const currentPage = Math.min(Math.max(page, 1), totalPages || 1);
  const lots: ReferenceLotItem[] = matching.slice((currentPage - 1) * 50, currentPage * 50).map((lot) => {
    const stats = physical.get(lot.lotNumber);
    return {
      lotNumber: lot.lotNumber,
      foundPhysically: Boolean(stats),
      physicalQuantity: stats?.quantity ?? 0,
      physicalOccurrences: stats?.occurrences ?? 0,
      fragmented: (stats?.locations.size ?? 0) > 1,
    };
  });
  return {
    reference: metadata,
    summary: {
      available: true,
      totalLots: metadata.totalLots,
      foundLots: metadata.lotsComplete ? [...referenceLots].filter((lot) => physicalLots.has(lot)).length : 0,
      pendingLots: metadata.lotsComplete ? [...referenceLots].filter((lot) => !physicalLots.has(lot)).length : metadata.totalLots,
      outsideReferenceLots: metadata.lotsComplete ? [...physicalLots].filter((lot) => !referenceLots.has(lot)).length : 0,
      fragmentedLots: [...physical.values()].filter((stats) => stats.locations.size > 1).length,
      physicalDistinctLots: physicalLots.size,
    },
    lots,
    page: currentPage,
    pageSize: 50,
    totalMatchingLots: matching.length,
    totalPages,
  };
}

export async function getReferenceState(inventory: Inventory, page = 1, query = ""): Promise<ReferenceState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return localReferenceState(inventory.id, page, query);
  try {
    return await fetchReferenceState(inventory, page, query);
  } catch {
    return localReferenceState(inventory.id, page, query);
  }
}

export async function removeReference(inventory: Inventory): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/reference`, {
    method: "DELETE",
    credentials: "include",
    headers: await authorizedHeaders(inventory),
  });
  if (!response.ok) throw await errorFromResponse(response, "Não foi possível remover a referência de lotes.");
  await clearLocalReference(inventory.id);
}

export async function checkReferenceLot(inventory: Inventory, lot: string): Promise<boolean | null> {
  const local = await db.inventoryReferences.get(inventory.id);
  if (local?.status === "ACTIVE") {
    const exists = await db.referenceLots.where("[inventoryId+lotNumber]").equals([inventory.id, lot]).count();
    if (exists > 0 || local.lotsComplete) return exists > 0;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/reference/match/${encodeURIComponent(lot)}`, {
      method: "GET",
      credentials: "include",
      headers: await authorizedHeaders(inventory),
    });
    if (!response.ok) return null;
    const result = await response.json() as { referenceAvailable: boolean; inReference: boolean | null };
    return result.referenceAvailable ? result.inReference : null;
  } catch {
    return null;
  }
}

export type { ApiImportResponse };
