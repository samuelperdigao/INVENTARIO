import Dexie, { type EntityTable } from "dexie";

import type { AnalysisCache, Inventory, InventoryEntry, SyncConflict, SyncMetadata } from "@/lib/models";

class InventoryDatabase extends Dexie {
  inventories!: EntityTable<Inventory, "id">;
  entries!: EntityTable<InventoryEntry, "id">;
  analysisCache!: EntityTable<AnalysisCache, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "id">;
  syncConflicts!: EntityTable<SyncConflict, "id">;

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
  }
}

export const db = new InventoryDatabase();
