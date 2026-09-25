import { v4 as uuidv4 } from "uuid";

import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedContext, refreshAuthenticatedSession } from "@/lib/auth-client";
import { db } from "@/lib/db";
import { listEntriesForSync, prepareInventoryForSync } from "@/lib/inventory-repository";
import type { Inventory, InventoryEntry, SyncConflict, SyncMetadata } from "@/lib/models";

const deviceMetadataId = "sync-device";
export const INVENTORY_POLLING_INTERVAL_MS = 10_000;

const inFlightSyncs = new Map<string, Promise<SyncResult>>();

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
  changed: boolean;
  remoteChanged: boolean;
  serverStatus?: Inventory["status"];
  serverDeleted?: boolean;
}

export interface SyncOptions {
  background?: boolean;
}

export class SyncHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "SyncHttpError";
  }
}

interface SyncSnapshot {
  inventory?: Inventory;
  entries: Map<string, InventoryEntry>;
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
  payload: { inventory: Inventory | null; entries: InventoryEntry[]; cursor: number; generation: number },
): Promise<SyncResponse> {
  const auth = await getAuthenticatedContext();
  const url = `${apiBaseUrl}/api/v1/sync`;
  const body = JSON.stringify({
    deviceId: await getDeviceId(),
    inventoryId,
    teamId: auth.teamId || null,
    cursor: payload.cursor,
    operationalGeneration: payload.generation,
    inventory: payload.inventory ? serializeInventory(payload.inventory) : null,
    entries: payload.entries.map(serializeEntry),
  });
  const send = (accessToken: string) => fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Inventory-Sync-Token": syncToken,
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });
  let response = await send(auth.accessToken);
  if (response.status === 401) {
    const renewed = await refreshAuthenticatedSession(auth.accessToken);
    response = await send(renewed.accessToken);
  }
  if (!response.ok) {
    if (response.status === 403) throw new SyncHttpError(response.status, "Código de sincronização inválido para este inventário.");
    if (response.status === 401) throw new SyncHttpError(response.status, "Sua sessão expirou. Entre novamente; os dados locais continuam preservados.");
    throw new SyncHttpError(response.status, "Não foi possível sincronizar agora. Os dados locais continuam preservados.");
  }
  return response.json() as Promise<SyncResponse>;
}

function serializeInventory(inventory: Inventory) {
  const { id, date, status, createdAt, updatedAt, revision, syncBaseRevision, tombstone, deletedAt } = inventory;
  return { id, date, status, createdAt, updatedAt, revision, syncBaseRevision, tombstone, deletedAt, operationalGeneration: inventory.operationalGeneration ?? 1 };
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
    operationalGeneration,
  } = entry;
  return {
    id,
    inventoryId,
    side,
    bay,
    layer: layer ?? null,
    lot,
    quantity,
    duplicateConfirmed: Boolean(duplicateConfirmed),
    createdAt,
    updatedAt,
    revision,
    syncBaseRevision,
    tombstone,
    deletedAt,
    operationalGeneration: operationalGeneration ?? 1,
  };
}

function remoteInventory(record: NonNullable<SyncResponse["inventory"]>, syncToken: string, participationCode?: string | null, isOwner?: boolean): Inventory {
  return { ...record, syncToken, isOwner, participationCode: participationCode ?? undefined, syncStatus: "SYNCED", syncBaseRevision: record.revision };
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

function inventoryContentKey(record: {
  id: string;
  date: string;
  status: Inventory["status"];
  createdAt: string;
  updatedAt: string;
  revision: number;
  tombstone: boolean;
  deletedAt?: string;
  operationalGeneration?: number;
}): string {
  return JSON.stringify([
    record.id,
    record.date,
    record.status,
    record.createdAt,
    record.updatedAt,
    record.revision,
    record.tombstone,
    record.deletedAt ?? null,
    record.operationalGeneration ?? 1,
  ]);
}

function inventoryStateKey(record: Inventory): string {
  return JSON.stringify([
    inventoryContentKey(record),
    record.syncStatus,
    record.syncBaseRevision,
    record.participationCode ?? null,
  ]);
}

function entryContentKey(record: {
  id: string;
  inventoryId: string;
  side: InventoryEntry["side"];
  bay: string;
  layer?: InventoryEntry["layer"];
  lot: string;
  quantity: number;
  duplicateConfirmed?: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  tombstone: boolean;
  deletedAt?: string;
  operationalGeneration?: number;
}): string {
  return JSON.stringify([
    record.id,
    record.inventoryId,
    record.side,
    record.bay,
    record.layer ?? null,
    record.lot,
    record.quantity,
    Boolean(record.duplicateConfirmed),
    record.createdAt,
    record.updatedAt,
    record.revision,
    record.tombstone,
    record.deletedAt ?? null,
    record.operationalGeneration ?? 1,
  ]);
}

function entryStateKey(record: InventoryEntry): string {
  return JSON.stringify([
    entryContentKey(record),
    record.syncStatus,
    record.syncBaseRevision,
    record.operationalGeneration ?? 1,
  ]);
}

function sameInventorySnapshot(current: Inventory, snapshot?: Inventory): boolean {
  if (!snapshot) return false;
  return current.revision === snapshot.revision
    && current.updatedAt === snapshot.updatedAt
    && current.syncStatus === snapshot.syncStatus
    && current.syncBaseRevision === snapshot.syncBaseRevision;
}

function sameEntrySnapshot(current: InventoryEntry, snapshot?: InventoryEntry): boolean {
  if (!snapshot) return false;
  return current.revision === snapshot.revision
    && current.updatedAt === snapshot.updatedAt
    && current.syncStatus === snapshot.syncStatus
    && current.syncBaseRevision === snapshot.syncBaseRevision;
}

async function applyResponse(
  inventoryId: string,
  syncToken: string,
  response: SyncResponse,
  snapshot: SyncSnapshot,
): Promise<SyncResult> {
  let received = 0;
  let changed = false;
  let remoteChanged = false;
  await db.transaction("rw", db.inventories, db.entries, db.syncMetadata, db.syncConflicts, async () => {
    let receivedRemoteEntry = false;
    const localInventory = await db.inventories.get(inventoryId);
    if (localInventory && response.acknowledged.inventory && sameInventorySnapshot(localInventory, snapshot.inventory)) {
      const nextInventory: Inventory = {
        ...localInventory,
        participationCode: response.participationCode === null ? undefined : response.participationCode ?? localInventory.participationCode,
        syncStatus: "SYNCED",
        syncBaseRevision: localInventory.revision,
      };
      if (inventoryStateKey(localInventory) !== inventoryStateKey(nextInventory)) {
        await db.inventories.put(nextInventory);
        changed = true;
      }
    }

    const acknowledgedEntryIds = new Set(response.acknowledged.entryIds);
    const authoritativeEntries = new Map(response.entries.map((entry) => [entry.id, entry]));
    for (const entryId of response.acknowledged.entryIds) {
      const localEntry = await db.entries.get(entryId);
      if (localEntry && sameEntrySnapshot(localEntry, snapshot.entries.get(entryId))) {
        const authoritative = authoritativeEntries.get(entryId);
        const nextEntry: InventoryEntry = authoritative
          ? remoteEntry(authoritative)
          : { ...localEntry, syncStatus: "SYNCED", syncBaseRevision: localEntry.revision };
        if (entryStateKey(localEntry) !== entryStateKey(nextEntry)) {
          await db.entries.put(nextEntry);
          changed = true;
        }
      }
    }

    if (response.inventory) {
      const remote = remoteInventory(response.inventory, syncToken, response.participationCode);
      const local = await db.inventories.get(remote.id);
      if (!local) {
        await db.inventories.put(remote);
        received += 1;
        changed = true;
        remoteChanged = true;
      } else if (response.acknowledged.inventory) {
        // Acknowledgement belongs to the request snapshot; keep newer local data untouched.
      } else if (local.syncStatus === "SYNCED") {
        const nextInventory = { ...remote, syncToken: local.syncToken || syncToken, isOwner: local.isOwner };
        if (inventoryStateKey(local) !== inventoryStateKey(nextInventory)) {
          await db.inventories.put(nextInventory);
          received += 1;
          changed = true;
          remoteChanged = true;
        }
      } else if ((remote.status === "FINISHED" && local.status !== "FINISHED") || remote.tombstone || (remote.operationalGeneration ?? 1) !== (local.operationalGeneration ?? 1)) {
        await recordConflict(inventoryId, "inventory", local, remote);
        if (local.syncStatus !== "ERROR") {
          await db.inventories.put({ ...local, syncStatus: "ERROR" });
          changed = true;
        }
      } else if (local.revision !== remote.revision) {
        await recordConflict(inventoryId, "inventory", local, remote);
        if (local.syncStatus !== "ERROR") {
          await db.inventories.put({ ...local, syncStatus: "ERROR" });
          changed = true;
        }
      }
      if (remote.tombstone || (remote.operationalGeneration ?? 1) > (snapshot.inventory?.operationalGeneration ?? 1)) {
        const pending = await db.entries.where("inventoryId").equals(inventoryId).filter((item) =>
          item.syncStatus === "PENDING" && (remote.tombstone || (item.operationalGeneration ?? 1) < (remote.operationalGeneration ?? 1)),
        ).toArray();
        for (const item of pending) {
          const serverRecord = response.entries.find((candidate) => candidate.id === item.id);
          await recordConflict(inventoryId, "entry", item, serverRecord ? remoteEntry(serverRecord) : { ...item, operationalGeneration: remote.operationalGeneration, revision: 0 });
          await db.entries.put({ ...item, syncStatus: "ERROR" });
          changed = true;
        }
      }
    }

    for (const record of response.entries) {
      if (acknowledgedEntryIds.has(record.id)) {
        // An acknowledgement for a stale snapshot must never overwrite a newer edit.
        continue;
      }
      const remote = remoteEntry(record);
      const local = await db.entries.get(remote.id);
      if (!local) {
        await db.entries.put(remote);
        received += 1;
        changed = true;
        remoteChanged = true;
        receivedRemoteEntry = true;
      } else if (local.syncStatus === "SYNCED") {
        if (entryStateKey(local) !== entryStateKey(remote)) {
          await db.entries.put(remote);
          received += 1;
          changed = true;
          remoteChanged = true;
          receivedRemoteEntry = true;
        }
      } else if (local.revision !== remote.revision || (local.operationalGeneration ?? 1) !== (remote.operationalGeneration ?? 1)) {
        await recordConflict(inventoryId, "entry", local, remote);
        if (local.syncStatus !== "ERROR") {
          await db.entries.put({ ...local, syncStatus: "ERROR" });
          changed = true;
        }
      }
    }

    if (receivedRemoteEntry) {
      const current = await db.inventories.get(inventoryId);
      if (current) {
        const nextInventory: Inventory = {
          ...current,
          revision: response.inventory && response.inventory.revision > (snapshot.inventory?.revision ?? 0)
            ? current.revision : current.revision + 1,
        };
        if (current.syncStatus === "SYNCED" && sameInventorySnapshot(current, snapshot.inventory)) {
          nextInventory.syncBaseRevision = nextInventory.revision;
        }
        if (inventoryStateKey(current) !== inventoryStateKey(nextInventory)) {
          await db.inventories.put(nextInventory);
          changed = true;
        }
      }
    }

    for (const conflict of response.conflicts) {
      const local = conflict.entityType === "inventory"
        ? await db.inventories.get(conflict.entityId)
        : await db.entries.get(conflict.entityId);
      if (!local) continue;
      const remote = conflict.entityType === "inventory"
        ? remoteInventory(conflict.serverRecord as NonNullable<SyncResponse["inventory"]>, syncToken, response.participationCode)
        : "id" in conflict.serverRecord
          ? remoteEntry(conflict.serverRecord as SyncResponse["entries"][number])
          : { ...local as InventoryEntry, revision: 0, operationalGeneration: response.inventory?.operationalGeneration ?? 1 };
      await recordConflict(inventoryId, conflict.entityType, local, remote);
      if (isEntry(local)) {
        if (local.syncStatus !== "ERROR") {
          await db.entries.put({ ...local, syncStatus: "ERROR" });
          changed = true;
        }
      } else if (local.syncStatus !== "ERROR") {
        await db.inventories.put({ ...local, syncStatus: "ERROR" });
        changed = true;
      }
    }

    const metadata: SyncMetadata = { id: inventoryId, cursor: response.cursor };
    await db.syncMetadata.put(metadata);
  });
  return {
    conflicts: response.conflicts.length,
    received,
    changed,
    remoteChanged,
    serverStatus: response.inventory?.status,
    serverDeleted: response.inventory?.tombstone === true,
  };
}

async function performSync(inventoryId: string, background: boolean, pullOnly = false): Promise<SyncResult> {
  const inventory = await prepareInventoryForSync(inventoryId);
  const entries = await listEntriesForSync(inventoryId);
  const snapshot: SyncSnapshot = { inventory, entries: new Map(entries.map((entry) => [entry.id, entry])) };
  const cursor = await getCursor(inventoryId);
  try {
    const response = await requestSync(inventoryId, inventory.syncToken, {
      cursor,
      generation: inventory.operationalGeneration ?? 1,
      inventory: pullOnly ? null : inventory.syncStatus === "PENDING" ? inventory : null,
      entries: pullOnly || inventory.tombstone ? [] : pendingEntries(entries),
    });
    return applyResponse(inventoryId, inventory.syncToken, response, snapshot);
  } catch (cause) {
    if (!pullOnly && cause instanceof SyncHttpError && cause.status === 409) {
      return performSync(inventoryId, background, true);
    }
    throw cause;
  }
}

export function syncInventory(inventoryId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const existing = inFlightSyncs.get(inventoryId);
  if (existing) return existing;
  const pending = performSync(inventoryId, options.background === true);
  const operation = pending.finally(() => {
    if (inFlightSyncs.get(inventoryId) === operation) inFlightSyncs.delete(inventoryId);
  });
  inFlightSyncs.set(inventoryId, operation);
  return operation;
}

export async function connectRemoteInventory(inventoryId: string, syncToken: string): Promise<SyncResult> {
  const response = await requestSync(inventoryId, syncToken, { inventory: null, entries: [], cursor: 0, generation: 1 });
  if (!response.inventory) throw new Error("Inventário não encontrado no servidor.");
  return applyResponse(inventoryId, syncToken, response, { entries: new Map() });
}

export async function connectAssignedInventory(inventoryId: string, syncToken: string): Promise<SyncResult> {
  const result = await connectRemoteInventory(inventoryId, syncToken);
  await db.transaction("rw", db.inventories, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (inventory) await db.inventories.put({ ...inventory, syncToken, isOwner: true });
  });
  return result;
}

export async function joinInventoryByCode(code: string): Promise<{ inventoryId: string; result: SyncResult }> {
  const auth = await getAuthenticatedContext();
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.accessToken}` },
    body: JSON.stringify({ code }),
  });
  const body = await response.json().catch(() => undefined) as { inventoryId?: string; accessToken?: string; detail?: string } | undefined;
  if (!response.ok || !body?.inventoryId || !body.accessToken) {
    throw new Error(body?.detail ?? "Não foi possível participar do inventário.");
  }
  const joinedInventoryId = body.inventoryId;
  const accessToken = body.accessToken;
  const syncResponse = await requestSync(joinedInventoryId, accessToken, { inventory: null, entries: [], cursor: 0, generation: 1 });
  const result = await applyResponse(joinedInventoryId, accessToken, syncResponse, { entries: new Map() });
  await db.transaction("rw", db.inventories, async () => {
    const inventory = await db.inventories.get(joinedInventoryId);
    if (inventory) await db.inventories.put({ ...inventory, isOwner: false });
  });
  return { inventoryId: joinedInventoryId, result };
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
      const inventory = await db.inventories.get(inventoryId);
      if (choice === "local" && (!inventory || inventory.status !== "OPEN" || inventory.tombstone
        || (inventory.operationalGeneration ?? 1) !== (conflict.serverRecord.operationalGeneration ?? 1))) {
        throw new Error("Atualize o inventário central antes de incorporar este lançamento.");
      }
      if (choice === "server" && conflict.serverRecord.revision === 0) {
        await db.entries.delete(conflict.entityId);
        await db.syncConflicts.delete(conflictId);
        return;
      }
      await db.entries.put(choice === "local"
        ? { ...chosen, operationalGeneration: inventory?.operationalGeneration ?? 1, revision: (conflict.serverRecord.revision ?? 0) + 1, syncBaseRevision: conflict.serverRecord.revision ?? 0, syncStatus: "PENDING" }
        : { ...chosen, syncStatus: "SYNCED", syncBaseRevision: chosen.revision });
    } else {
      const current = await db.inventories.get(inventoryId);
      const chosen = choice === "local" ? conflict.localRecord as Inventory : conflict.serverRecord as Inventory;
      if (choice === "local" && ((current?.operationalGeneration ?? 1) !== (conflict.serverRecord.operationalGeneration ?? 1) || conflict.serverRecord.tombstone)) {
        throw new Error("Esta geração foi encerrada. Mantenha a versão central e confira os lançamentos locais separadamente.");
      }
      await db.inventories.put(choice === "local"
        ? { ...chosen, syncToken: current?.syncToken ?? chosen.syncToken, revision: conflict.serverRecord.revision + 1, syncBaseRevision: conflict.serverRecord.revision, syncStatus: "PENDING" }
        : { ...chosen, syncToken: current?.syncToken ?? chosen.syncToken, syncStatus: "SYNCED", syncBaseRevision: chosen.revision });
    }
    await db.syncConflicts.delete(conflictId);
  });
}
