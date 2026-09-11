import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createEntry,
  createInventory,
  getInventory,
  listActiveEntries,
  tombstoneEntry,
  updateEntry,
  validateEntryDraft,
} from "@/lib/inventory-repository";

describe("repositório IndexedDB", () => {
  it("cria, relê, edita e tombstona lançamento na mesma fonte local", async () => {
    const inventory = await createInventory("2026-09-11");
    const created = await createEntry(inventory.id, { side: "EF", bay: "01", lot: " 0007 ", quantity: 3 });

    expect((await listActiveEntries(inventory.id))[0]).toMatchObject({ lot: "0007", quantity: 3, tombstone: false });
    const afterCreate = await getInventory(inventory.id);
    expect(afterCreate?.revision).toBe(2);

    await updateEntry(created.id, { side: "DE", bay: "02", lot: "0007", quantity: 5 });
    expect((await listActiveEntries(inventory.id))[0]).toMatchObject({ side: "DE", bay: "02", quantity: 5, revision: 2 });

    await tombstoneEntry(created.id);
    expect(await listActiveEntries(inventory.id)).toEqual([]);
    expect((await db.entries.get(created.id))?.tombstone).toBe(true);
    expect((await db.entries.get(created.id))?.deletedAt).toBeTruthy();
    expect((await getInventory(inventory.id))?.revision).toBe(4);
  });

  it("valida todos os campos antes da operação de armazenamento", () => {
    expect(validateEntryDraft({ side: "EF", bay: "", lot: "L", quantity: 1 })).toMatch(/vão/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: " ", quantity: 1 })).toMatch(/lote/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: "L", quantity: 0 })).toMatch(/inteiro positivo/);
  });
});

