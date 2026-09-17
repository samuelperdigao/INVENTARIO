import Dexie, { type EntityTable } from "dexie";

import type { AnalysisCache, Inventory, InventoryEntry, InventoryReference, LocalReferenceLot, SyncConflict, SyncMetadata } from "@/lib/models";

class InventoryDatabase extends Dexie {
  inventories!: EntityTable<Inventory, "id">;
  entries!: EntityTable<InventoryEntry, "id">;
  analysisCache!: EntityTable<AnalysisCache, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "id">;
  syncConflicts!: EntityTable<SyncConflict, "id">;
  inventoryReferences!: EntityTable<InventoryReference, "id">;
  referenceLots!: EntityTable<LocalReferenceLot, "id">;

  constructor() {
    super("inventario-offline");
    this.version(1).stores({
      inventories: "id, date, updatedAt, tombstone",
      entries: "id, inventoryId, [inventoryId+tombstone], side, bay, lot, updatedAt, tombstone",
      analysisCache: "id, [inventoryId+revision], inventoryId, cachedAt",
    });
    this.version(2).stores({
      inventories: "id, date, updatedAt, tombstone",
      entries: "id, inventoryId, [inventoryId+tombstone], side, bay, lot, updatedAt, tombstone",
      analysisCache: "id, [inventoryId+revision], inventoryId, cachedAt",
      syncMetadata: "id",
      syncConflicts: "id, inventoryId, entityId, createdAt",
    });
    this.version(3).stores({
      inventories: "id, date, updatedAt, tombstone",
      entries: "id, inventoryId, [inventoryId+tombstone], [inventoryId+lot], side, bay, layer, lot, updatedAt, tombstone",
      analysisCache: "id, [inventoryId+revision], inventoryId, cachedAt",
      syncMetadata: "id",
      syncConflicts: "id, inventoryId, entityId, createdAt",
    });
    this.version(4).stores({
      inventories: "id, date, updatedAt, tombstone",
      entries: "id, inventoryId, [inventoryId+tombstone], [inventoryId+lot], side, bay, layer, lot, updatedAt, tombstone",
      analysisCache: "id, [inventoryId+revision], inventoryId, cachedAt",
      syncMetadata: "id",
      syncConflicts: "id, inventoryId, entityId, createdAt",
      inventoryReferences: "id, inventoryId, updatedAt, status",
      referenceLots: "id, inventoryId, [inventoryId+lotNumber], lotNumber",
    });
  }
}

export const db = new InventoryDatabase();
