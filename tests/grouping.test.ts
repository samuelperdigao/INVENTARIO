import { expect, it } from "vitest";

import { groupEntries } from "@/lib/grouping";
import type { InventoryEntry } from "@/lib/models";

function entry(side: "EF" | "DE", bay: string, lot: string, id: string): InventoryEntry {
  return {
    id,
    inventoryId: "inventory",
    side,
    bay,
    lot,
    quantity: 1,
    createdAt: id,
    updatedAt: id,
    revision: 1,
    syncStatus: "PENDING",
    tombstone: false,
  };
}

it("mantém lançamentos individuais e ordena EF, DE, vãos e lotes naturalmente", () => {
  const groups = groupEntries([
    entry("DE", "10", "20", "4"),
    entry("EF", "11", "10", "3"),
    entry("EF", "2", "10", "2"),
    entry("EF", "2", "2", "1"),
  ]);

  expect(groups.map((group) => group.side)).toEqual(["EF", "DE"]);
  expect(groups[0].bays.map((bay) => bay.bay)).toEqual(["2", "11"]);
  expect(groups[0].bays[0].entries.map((item) => item.lot)).toEqual(["2", "10"]);
  expect(groups[0].bays[0].entries).toHaveLength(2);
});

