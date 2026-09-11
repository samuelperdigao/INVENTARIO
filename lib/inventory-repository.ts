import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { localDateIso } from "@/lib/local-date";
import type { EntryDraft, Inventory, InventoryEntry } from "@/lib/models";

function timestamp(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value.trim();
}

export function validateEntryDraft(draft: EntryDraft): string | undefined {
  if (draft.side !== "EF" && draft.side !== "DE") return "Selecione o lado.";
  if (!normalizeText(draft.bay)) return "Informe o vão.";
  if (!normalizeText(draft.lot)) return "Informe o lote.";
  if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) {
    return "A quantidade deve ser um inteiro positivo.";
  }
  return undefined;
}

async function bumpInventory(inventory: Inventory, now: string): Promise<void> {
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
    createdAt: now,
    updatedAt: now,
    revision: 1,
    syncStatus: "PENDING",
    tombstone: false,
  };
  await db.inventories.add(inventory);
  return inventory;
}

export async function listOpenInventories(): Promise<Inventory[]> {
  return db.inventories.filter((inventory) => !inventory.tombstone && inventory.status === "OPEN").sortBy("createdAt");
}

export async function getInventory(id: string): Promise<Inventory | undefined> {
  const inventory = await db.inventories.get(id);
  return inventory && !inventory.tombstone ? inventory : undefined;
}

export async function listActiveEntries(inventoryId: string): Promise<InventoryEntry[]> {
  return db.entries.filter((entry) => entry.inventoryId === inventoryId && !entry.tombstone).toArray();
}

export async function createEntry(inventoryId: string, draft: EntryDraft): Promise<InventoryEntry> {
  const validationError = validateEntryDraft(draft);
  if (validationError) throw new Error(validationError);

  const now = timestamp();
  const entry: InventoryEntry = {
    id: uuidv7(),
    inventoryId,
    side: draft.side,
    bay: normalizeText(draft.bay),
    lot: normalizeText(draft.lot),
    quantity: draft.quantity,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    syncStatus: "PENDING",
    tombstone: false,
  };

  await db.transaction("rw", db.inventories, db.entries, async () => {
    const inventory = await db.inventories.get(inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    await db.entries.add(entry);
    await bumpInventory(inventory, now);
  });
  return entry;
}

export async function updateEntry(entryId: string, draft: EntryDraft): Promise<InventoryEntry> {
  const validationError = validateEntryDraft(draft);
  if (validationError) throw new Error(validationError);

  const now = timestamp();
  let updatedEntry: InventoryEntry | undefined;
  await db.transaction("rw", db.inventories, db.entries, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry || entry.tombstone) throw new Error("Registro não encontrado.");
    const inventory = await db.inventories.get(entry.inventoryId);
    if (!inventory || inventory.tombstone) throw new Error("Inventário não encontrado.");
    updatedEntry = {
      ...entry,
      side: draft.side,
      bay: normalizeText(draft.bay),
      lot: normalizeText(draft.lot),
      quantity: draft.quantity,
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
