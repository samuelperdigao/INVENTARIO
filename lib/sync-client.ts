import { v4 as uuidv4 } from "uuid";

import { db } from "@/lib/db";
import { getAuthenticatedContext } from "@/lib/auth-client";
import { listEntriesForSync, prepareInventoryForSync } from "@/lib/inventory-repository";
import type { Inventory, InventoryEntry, SyncConflict, SyncMetadata } from "@/lib/models";

const syncBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";
const deviceMetadataId = "sync-device";

interface SyncResponse {
  cursor: number;
  inventory: Omit<Inventory, "syncToken" | "syncStatus" | "syncBaseRevision"> | null;
  entries: Array<Omit<InventoryEntry, "syncStatus" | "syncBaseRevision">>;
  acknowledged: { inventory: boolean; entryIds: string[] };
  conflicts: Array<{
    entityType: "inventory" | "entry";
    entityId: string;
    serverRecord: Omit<Inventory, "syncToken" | "syncStatus" | "syncBaseRevision"> | Omit<InventoryEntry, "syncStatus" | "syncBaseRevision">;
  }>;
  participationCode?: string | null;
}

export interface SyncResult {
  conflicts: number;
  received: number;
}

function isEntry(record: Inventory | InventoryEntry): record is InventoryEntry {
  return "inventoryId" in record;
}

async function getDeviceId(): Promise<string> {
  const stored = await db.syncMetadata.get(deviceMetadataId);
  if (stored?.deviceId) return stored.deviceId;
  const deviceId = uuidv4();
  await db.syncMetadata.put({ id: deviceMetadataId, deviceId });
  return deviceId;
}

async function getCursor(inventoryId: string): Promise<number> {
  return (await db.syncMetadata.get(inventoryId))?.cursor ?? 0;
}

function pendingEntries(entries: InventoryEntry[]): InventoryEntry[] {
  return entries.filter((entry) => entry.syncStatus === "PENDING");
}

async function requestSync(
  inventoryId: string,
  syncToken: string,
  payload: { inventory: Inventory | null; entries: InventoryEntry[]; cursor: number },
): Promise<SyncResponse> {
  const auth = await getAuthenticatedContext();
  const response = await fetch(`${syncBaseUrl}/api/v1/sync`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Inventory-Sync-Token": syncToken,
      Authorization: `Bearer ${auth.accessToken}`,
    },
    body: JSON.stringify({
      deviceId: await getDeviceId(),
      inventoryId,
      teamId: auth.teamId || null,
      cursor: payload.cursor,
      inventory: payload.inventory ? serializeInventory(payload.inventory) : null,
      entries: payload.entries.map(serializeEntry),
    }),
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Código de sincronização inválido para este inventário.");
    throw new Error("Não foi possível sincronizar agora. Os dados locais continuam preservados.");
  }
  return response.json() as Promise<SyncResponse>;
}

function serializeInventory(inventory: Inventory) {
  const { id, date, status, createdAt, updatedAt, revision, syncBaseRevision, tombstone, deletedAt } = inventory;
  return { id, date, status, createdAt, updatedAt, revision, syncBaseRevision, tombstone, deletedAt };
}

function serializeEntry(entry: InventoryEntry) {
  const {
    id,
    inventoryId,
    side,
    bay,
    layer,
    lot,
    quantity,
    duplicateConfirmed,
    createdAt,
    updatedAt,
    revision,
    syncBaseRevision,
    tombstone,
    deletedAt,
  } = entry;
  return {
    id,
    inventoryId,
    side,
    bay,
    layer,
    lot,
    quantity,
    duplicateConfirmed: Boolean(duplicateConfirmed),
    createdAt,
    updatedAt,
    revision,
    syncBaseRevision,
    tombstone,
    deletedAt,
  };
}

function remoteInventory(record: NonNullable<SyncResponse["inventory"]>, syncToken: string, participationCode?: string | null): Inventory {
  return { ...record, syncToken, participationCode: participationCode ?? undefined, syncStatus: "SYNCED", syncBaseRevision: record.revision };
}

function remoteEntry(record: SyncResponse["entries"][number]): InventoryEntry {
  return { ...record, syncStatus: "SYNCED", syncBaseRevision: record.revision };
}

async function recordConflict(
  inventoryId: string,
  entityType: SyncConflict["entityType"],
  localRecord: Inventory | InventoryEntry,
  serverRecord: Inventory | InventoryEntry,
): Promise<void> {
  await db.syncConflicts.put({
    id: `${entityType}:${localRecord.id}:${localRecord.revision}:${serverRecord.revision}`,
    inventoryId,
    entityType,
    entityId: localRecord.id,
    localRecord,
    serverRecord,
    createdAt: new Date().toISOString(),
  });
}

async function applyResponse(inventoryId: string, syncToken: string, response: SyncResponse): Promise<SyncResult> {
  let received = 0;
  await db.transaction("rw", db.inventories, db.entries, db.syncMetadata, db.syncConflicts, async () => {
    let receivedRemoteEntry = false;
    const localInventory = await db.inventories.get(inventoryId);
    if (localInventory && response.acknowledged.inventory) {
      await db.inventories.put({
        ...localInventory,
        participationCode: response.participationCode === null ? undefined : response.participationCode ?? localInventory.participationCode,
        syncStatus: "SYNCED",
        syncBaseRevision: localInventory.revision,
      });
    }
    for (const entryId of response.acknowledged.entryIds) {
      const localEntry = await db.entries.get(entryId);
      if (localEntry) {
        const authoritative = response.entries.find((entry) => entry.id === entryId);
        await db.entries.put(authoritative
          ? remoteEntry(authoritative)
          : { ...localEntry, syncStatus: "SYNCED", syncBaseRevision: localEntry.revision });
      }
    }

    if (response.inventory) {
      const remote = remoteInventory(response.inventory, syncToken, response.participationCode);
      const local = await db.inventories.get(remote.id);
      if (!local) {
        await db.inventories.put(remote);
        received += 1;
      } else if (response.acknowledged.inventory) {
        await db.inventories.put({
          ...local,
          participationCode: response.participationCode === null ? undefined : response.participationCode ?? local.participationCode,
          syncStatus: "SYNCED",
          syncBaseRevision: local.revision,
        });
      } else if (local.syncStatus === "SYNCED") {
        await db.inventories.put({ ...remote, syncToken: local.syncToken || syncToken });
        received += 1;
      } else if (local.revision !== remote.revision) {
        await recordConflict(inventoryId, "inventory", local, remote);
        await db.inventories.put({ ...local, syncStatus: "ERROR" });
      }
    }

    for (const record of response.entries) {
      const remote = remoteEntry(record);
      const local = await db.entries.get(remote.id);
      if (!local) {
        await db.entries.put(remote);
        received += 1;
        receivedRemoteEntry = !response.acknowledged.entryIds.includes(remote.id);
      } else if (local.syncStatus === "SYNCED" || response.acknowledged.entryIds.includes(remote.id)) {
        await db.entries.put(remote);
        received += 1;
        if (!response.acknowledged.entryIds.includes(remote.id)) receivedRemoteEntry = true;
      } else if (local.revision !== remote.revision) {
        await recordConflict(inventoryId, "entry", local, remote);
        await db.entries.put({ ...local, syncStatus: "ERROR" });
      }
    }

    if (receivedRemoteEntry) {
      const current = await db.inventories.get(inventoryId);
      if (current) {
        await db.inventories.put({
          ...current,
          revision: current.revision + 1,
          syncBaseRevision: current.revision + 1,
          syncStatus: "SYNCED",
        });
      }
    }

    for (const conflict of response.conflicts) {
      const local = conflict.entityType === "inventory"
        ? await db.inventories.get(conflict.entityId)
        : await db.entries.get(conflict.entityId);
      if (!local) continue;
      const remote = conflict.entityType === "inventory"
        ? remoteInventory(conflict.serverRecord as NonNullable<SyncResponse["inventory"]>, syncToken, response.participationCode)
        : remoteEntry(conflict.serverRecord as SyncResponse["entries"][number]);
      await recordConflict(inventoryId, conflict.entityType, local, remote);
      if (isEntry(local)) await db.entries.put({ ...local, syncStatus: "ERROR" });
      else await db.inventories.put({ ...local, syncStatus: "ERROR" });
    }

    const metadata: SyncMetadata = { id: inventoryId, cursor: response.cursor };
    await db.syncMetadata.put(metadata);
  });
  return { conflicts: response.conflicts.length, received };
}

export async function syncInventory(inventoryId: string): Promise<SyncResult> {
  const inventory = await prepareInventoryForSync(inventoryId);
  const entries = await listEntriesForSync(inventoryId);
  const response = await requestSync(inventoryId, inventory.syncToken, {
    cursor: await getCursor(inventoryId),
    inventory: inventory.syncStatus === "PENDING" ? inventory : null,
    entries: pendingEntries(entries),
  });
  return applyResponse(inventoryId, inventory.syncToken, response);
}

export async function connectRemoteInventory(inventoryId: string, syncToken: string): Promise<SyncResult> {
  const response = await requestSync(inventoryId, syncToken, { inventory: null, entries: [], cursor: 0 });
  if (!response.inventory) throw new Error("Inventário não encontrado no servidor.");
  return applyResponse(inventoryId, syncToken, response);
}

export async function joinInventoryByCode(code: string): Promise<{ inventoryId: string; result: SyncResult }> {
  const auth = await getAuthenticatedContext();
  const response = await fetch(`${syncBaseUrl}/api/v1/inventories/join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
    body: JSON.stringify({ code }),
  });
  const body = await response.json().catch(() => undefined) as { inventoryId?: string; accessToken?: string; detail?: string } | undefined;
  if (!response.ok || !body?.inventoryId || !body.accessToken) {
    throw new Error(body?.detail ?? "Não foi possível participar do inventário.");
  }
  const syncResponse = await requestSync(body.inventoryId, body.accessToken, { inventory: null, entries: [], cursor: 0 });
  return { inventoryId: body.inventoryId, result: await applyResponse(body.inventoryId, body.accessToken, syncResponse) };
}

export async function listSyncConflicts(inventoryId: string): Promise<SyncConflict[]> {
  return db.syncConflicts.where("inventoryId").equals(inventoryId).sortBy("createdAt");
}

export async function resolveConflict(inventoryId: string, conflictId: string, choice: "local" | "server"): Promise<void> {
  await db.transaction("rw", db.inventories, db.entries, db.syncConflicts, async () => {
    const conflict = await db.syncConflicts.get(conflictId);
    if (!conflict || conflict.inventoryId !== inventoryId) throw new Error("Conflito não encontrado.");
    if (conflict.entityType === "entry") {
      const chosen = choice === "local" ? conflict.localRecord as InventoryEntry : conflict.serverRecord as InventoryEntry;
      await db.entries.put(choice === "local"
        ? { ...chosen, revision: conflict.serverRecord.revision + 1, syncBaseRevision: conflict.serverRecord.revision, syncStatus: "PENDING" }
        : { ...chosen, syncStatus: "SYNCED", syncBaseRevision: chosen.revision });
    } else {
      const current = await db.inventories.get(inventoryId);
      const chosen = choice === "local" ? conflict.localRecord as Inventory : conflict.serverRecord as Inventory;
      await db.inventories.put(choice === "local"
        ? { ...chosen, syncToken: current?.syncToken ?? chosen.syncToken, revision: conflict.serverRecord.revision + 1, syncBaseRevision: conflict.serverRecord.revision, syncStatus: "PENDING" }
        : { ...chosen, syncToken: current?.syncToken ?? chosen.syncToken, syncStatus: "SYNCED", syncBaseRevision: chosen.revision });
    }
    await db.syncConflicts.delete(conflictId);
  });
}
