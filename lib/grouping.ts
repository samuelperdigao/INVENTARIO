import type { InventoryEntry, Side } from "@/lib/models";

const naturalCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const sides: Side[] = ["EF", "DE"];

export interface EntryGroup {
  side: Side;
  bays: Array<{ bay: string; entries: InventoryEntry[] }>;
}

export function groupEntries(entries: InventoryEntry[]): EntryGroup[] {
  return sides.flatMap((side) => {
    const entriesForSide = entries.filter((entry) => entry.side === side);
    if (entriesForSide.length === 0) return [];
    const byBay = new Map<string, InventoryEntry[]>();
    entriesForSide.forEach((entry) => {
      const existing = byBay.get(entry.bay) ?? [];
      existing.push(entry);
      byBay.set(entry.bay, existing);
    });
    return [{
      side,
      bays: [...byBay.entries()]
        .sort(([left], [right]) => naturalCollator.compare(left, right))
        .map(([bay, bayEntries]) => ({
          bay,
          entries: [...bayEntries].sort((left, right) => {
            const byLot = naturalCollator.compare(left.lot, right.lot);
            return byLot !== 0 ? byLot : naturalCollator.compare(left.createdAt, right.createdAt);
          }),
        })),
    }];
  });
}

