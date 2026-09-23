import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { localDateIso } from "@/lib/local-date";
import { normalizeLot, validateLot } from "@/lib/lot-rules";
import { INVENTORY_LAYERS, type EntryDraft, type Inventory, type InventoryEntry } from "@/lib/models";

function timestamp(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string { return value.trim(); }

export class DuplicateLotError extends Error {
  readonly duplicates: InventoryEntry[];

  constructor(duplicates: InventoryEntry[]) {
    super("Este lote já possui lançamento neste inventário.");
    this.name = "DuplicateLotError";
    this.duplicates = duplicates;
  }
}

export class InventoryDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryDeletionError";
  }
}

export interface InventoryDeletionSnapshot {
  previous: Inventory;
  tombstoned: Inventory;
}

export interface EntrySaveOptions {
  allowDuplicate?: boolean;
  createdByUserId?: string;
  createdByName?: string;
}

export function validateEntryDraft(draft: EntryDraft): string | undefined {
  if (draft.side !== "EF" && draft.side !== "DE") return "Selecione o lado.";
  if (!normalizeText(draft.bay)) return "Informe o vão.";
  if (draft.layer != null && !INVENTORY_LAYERS.includes(draft.layer)) return "Selecione uma camada válida de A1 até A10.";
  const lotError = validateLot(draft.lot);
  if (lotError) return lotError;
  if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) {
    return "A quantidade deve ser um inteiro positivo.";
  }
  return undefined;
}

async function bumpInventory(inventory: Inventory, now: string): Promise<void> {
  if (inventory.status !== "OPEN") throw new Error("Inventário finalizado não aceita alterações.");
  await db.inventories.put({
    ...inventory,
    updatedAt: now,
    revision: inventory.revision + 1,
    syncStatus: "PENDING",
  });
}

export async function createInventory(date = localDateIso()): Promise<Inventory> {
  const now = timestamp();
  const inventory: Inventory = {
    id: uuidv7(),
    date,
    status: "OPEN",
    operationalGeneration: 1,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    syncBaseRevision: 0,
    syncStatus: "PENDING",
    tombstone: false,
    syncToken: uuidv4(),
    isOwner: true,
  };
  await db.inventories.add(inventory);
  return inventory;
}

export async function listOpenInventories(): Promise<Inventory[]> {
  return db.inventories.filter((inventory) => !inventory.tombstone && inventory.status === "OPEN").sortBy("createdAt");
}

export async function listLocalInventories(): Promise<Inventory[]> {
  return db.inventories.filter((inventory) => !inventory.tombstone).sortBy("createdAt");
}

export async function getInventory(id: string): Promise<Inventory | undefined> {
  const inventory = await db.inventories.get(id);
  return inventory && !inventory.tombstone ? inventory : undefined;
}

export async function listActiveEntries(inventoryId: string): Promise<InventoryEntry[]> {
  return db.entries.filter((entry) => entry.inventoryId === inventoryId && !entry.tombstone).toArray();
}

export async function findDuplicateLotEntries(inventoryId: string, lot: string, excludeEntryId?: string): Promise<InventoryEntry[]> {
  const normalizedLot = normalizeLot(lot);
  return db.entries
    .where("[inventoryId+lot]")
    .equals([inventoryId, normalizedLot])
    .filter((entry) => !entry.tombstone && entry.id !== excludeEntryId)
    .sortBy("createdAt");
}

export async function createEntry(inventoryId: string, draft: EntryDraft, options: EntrySaveOptions = {}): Promise<InventoryEntry> {
  const validationError = validateEntryDraft(draft);
  if (validationError) throw new Error(validationError);

  const now = timestamp();
  const normalizedLot = normalizeLot(draft.lot);
  const entry: InventoryEntry = {
    id: uuidv7(),
    inventoryId,
    side: draft.side,
    bay: normalizeText(draft.bay),
    layer: draft.layer || undefined,
    lot: normalizedLot,
    quantity: draft.quantity,
    createdByUserId: options.createdByUserId,
    createdByName: options.createdByName,
    duplicateConfirmed: Boolean(options.allowDuplicate),
    createdAt: now,
    updatedAt: now,
    revision: 1,
    syncBaseRevision: 0,
    syncStatus: "PENDING",
    tombstone: false,
  };

  await db.transaction("rw", db.inventories, db.entries, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    entry.operationalGeneration = inventory.operationalGeneration ?? 1;
    if (!options.allowDuplicate) {
      const duplicates = await findDuplicateLotEntries(inventoryId, normalizedLot);
      if (duplicates.length > 0) throw new DuplicateLotError(duplicates);
    }
    await db.entries.add(entry);
    await bumpInventory(inventory, now);
  });
  return entry;
}

export async function markInventoryFinished(inventoryId: string, revision: number): Promise<void> {
  await db.transaction("rw", db.inventories, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    await db.inventories.put({
      ...inventory,
      status: "FINISHED",
      revision,
      syncBaseRevision: revision,
      syncStatus: "SYNCED",
      participationCode: undefined,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function updateEntry(entryId: string, draft: EntryDraft, options: EntrySaveOptions = {}): Promise<InventoryEntry> {
  const validationError = validateEntryDraft(draft);
  if (validationError) throw new Error(validationError);

  const now = timestamp();
  let updatedEntry: InventoryEntry | undefined;
  await db.transaction("rw", db.inventories, db.entries, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry || entry.tombstone) throw new Error("Registro não encontrado.");
    const inventory = await db.inventories.get(entry.inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    const normalizedLot = normalizeLot(draft.lot);
    if (!options.allowDuplicate) {
      const duplicates = await findDuplicateLotEntries(entry.inventoryId, normalizedLot, entry.id);
      if (duplicates.length > 0) throw new DuplicateLotError(duplicates);
    }
    updatedEntry = {
      ...entry,
      operationalGeneration: inventory.operationalGeneration ?? 1,
      side: draft.side,
      bay: normalizeText(draft.bay),
      layer: draft.layer || undefined,
      lot: normalizedLot,
      quantity: draft.quantity,
      duplicateConfirmed: Boolean(options.allowDuplicate),
      updatedAt: now,
      revision: entry.revision + 1,
      syncStatus: "PENDING",
    };
    await db.entries.put(updatedEntry);
    await bumpInventory(inventory, now);
  });
  if (!updatedEntry) throw new Error("Registro não encontrado.");
  return updatedEntry;
}

export async function tombstoneEntry(entryId: string): Promise<void> {
  const now = timestamp();
  await db.transaction("rw", db.inventories, db.entries, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry || entry.tombstone) throw new Error("Registro não encontrado.");
    const inventory = await db.inventories.get(entry.inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    await db.entries.put({
      ...entry,
      tombstone: true,
      deletedAt: now,
      updatedAt: now,
      revision: entry.revision + 1,
      syncStatus: "PENDING",
    });
    await bumpInventory(inventory, now);
  });
}

export async function tombstoneEmptyInventory(inventoryId: string): Promise<InventoryDeletionSnapshot> {
  const now = timestamp();
  let snapshot: InventoryDeletionSnapshot | undefined;
  await db.transaction("rw", db.inventories, db.entries, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory || inventory.tombstone) throw new InventoryDeletionError("Inventário não encontrado.");
    if (inventory.status !== "OPEN") throw new InventoryDeletionError("Inventário finalizado não pode ser excluído.");
    const activeEntry = await db.entries
      .where("inventoryId")
      .equals(inventoryId)
      .filter((entry) => !entry.tombstone)
      .first();
    if (activeEntry) throw new InventoryDeletionError("Exclua os lançamentos antes de excluir o inventário.");

    const tombstoned: Inventory = {
      ...inventory,
      tombstone: true,
      deletedAt: now,
      updatedAt: now,
      revision: inventory.revision + 1,
      syncStatus: "PENDING",
    };
    await db.inventories.put(tombstoned);
    snapshot = { previous: inventory, tombstoned };
  });
  if (!snapshot) throw new InventoryDeletionError("Inventário não encontrado.");
  return snapshot;
}

export async function restoreInventoryAfterDeletionFailure(inventoryId: string): Promise<void> {
  await db.transaction("rw", db.inventories, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory || !inventory.tombstone) return;
    await db.inventories.put({
      ...inventory,
      tombstone: false,
      deletedAt: undefined,
      revision: Math.max(1, inventory.revision - 1),
      syncStatus: "ERROR",
      participationCode: inventory.participationCode,
    });
  });
}

export async function listPendingInventoryDeletions(): Promise<Inventory[]> {
  return db.inventories.filter((inventory) => inventory.tombstone && inventory.syncStatus === "PENDING").toArray();
}

export async function purgeInventory(inventoryId: string): Promise<void> {
  await db.transaction(
    "rw",
    db.entries,
    db.analysisCache,
    db.syncConflicts,
    db.inventoryReferences,
    db.referenceLots,
    async () => {
      await db.entries.where("inventoryId").equals(inventoryId).delete();
      await db.analysisCache.where("inventoryId").equals(inventoryId).delete();
      await db.syncConflicts.where("inventoryId").equals(inventoryId).delete();
      await db.inventoryReferences.where("inventoryId").equals(inventoryId).delete();
      await db.referenceLots.where("inventoryId").equals(inventoryId).delete();
    },
  );
  await db.transaction("rw", db.inventories, db.syncMetadata, async () => {
      await db.syncMetadata.delete(inventoryId);
      await db.inventories.delete(inventoryId);
  });
}

/** Compatibiliza inventários criados na Fase 1 antes da chave de sincronização. */
export async function prepareInventoryForSync(inventoryId: string): Promise<Inventory> {
  return db.transaction("rw", db.inventories, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory) throw new Error("Inventário não encontrado.");
    const prepared: Inventory = {
      ...inventory,
      syncToken: inventory.syncToken || uuidv4(),
      syncBaseRevision: inventory.syncBaseRevision ?? 0,
      syncStatus: inventory.syncStatus ?? "PENDING",
    };
    await db.inventories.put(prepared);
    return prepared;
  });
}

export async function listEntriesForSync(inventoryId: string): Promise<InventoryEntry[]> {
  return db.entries.where("inventoryId").equals(inventoryId).toArray();
}
