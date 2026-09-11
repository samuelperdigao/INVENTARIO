import Dexie, { type EntityTable } from "dexie";

import type { AnalysisCache, Inventory, InventoryEntry } from "@/lib/models";

class InventoryDatabase extends Dexie {
  inventories!: EntityTable<Inventory, "id">;
  entries!: EntityTable<InventoryEntry, "id">;
  analysisCache!: EntityTable<AnalysisCache, "id">;

  constructor() {
    super("inventario-offline");
    this.version(1).stores({
      inventories: "id, date, updatedAt, tombstone",
      entries: "id, inventoryId, [inventoryId+tombstone], side, bay, lot, updatedAt, tombstone",
      analysisCache: "id, [inventoryId+revision], inventoryId, cachedAt",
    });
  }
}

export const db = new InventoryDatabase();
