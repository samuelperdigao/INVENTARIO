import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  createEntry,
  createInventory,
  DuplicateLotError,
  getInventory,
  listActiveEntries,
  tombstoneEntry,
  updateEntry,
  validateEntryDraft,
} from "@/lib/inventory-repository";

describe("repositório IndexedDB", () => {
  it("cria, relê, edita e tombstona lançamento na mesma fonte local", async () => {
    const inventory = await createInventory("2026-09-11");
    const created = await createEntry(inventory.id, { side: "EF", bay: "01", layer: "A1", lot: " 2712345678 ", quantity: 3 });

    expect((await listActiveEntries(inventory.id))[0]).toMatchObject({ lot: "2712345678", layer: "A1", quantity: 3, tombstone: false });
    const afterCreate = await getInventory(inventory.id);
    expect(afterCreate?.revision).toBe(2);

    await updateEntry(created.id, { side: "DE", bay: "02", layer: "A2", lot: "2712345678", quantity: 5 });
    expect((await listActiveEntries(inventory.id))[0]).toMatchObject({ side: "DE", bay: "02", layer: "A2", lot: "2712345678", quantity: 5, revision: 2 });

    await tombstoneEntry(created.id);
    expect(await listActiveEntries(inventory.id)).toEqual([]);
    expect((await db.entries.get(created.id))?.tombstone).toBe(true);
    expect((await db.entries.get(created.id))?.deletedAt).toBeTruthy();
    expect((await getInventory(inventory.id))?.revision).toBe(4);
  });

  it("persiste lançamento sem camada quando a posição não exige esse detalhamento", async () => {
    const inventory = await createInventory("2026-09-14");
    const created = await createEntry(inventory.id, { side: "DE", bay: "21", lot: "2812345678", quantity: 7 });

    expect(created.layer).toBeUndefined();
    expect((await listActiveEntries(inventory.id))[0]).toMatchObject({ side: "DE", bay: "21", lot: "2812345678", quantity: 7 });
  });

  it("exige confirmação explícita para lote repetido no mesmo inventário", async () => {
    const inventory = await createInventory("2026-09-12");
    await createEntry(inventory.id, { side: "EF", bay: "15", layer: "A1", lot: "2815634434", quantity: 19 });

    await expect(createEntry(
      inventory.id,
      { side: "DE", bay: "21", layer: "A7", lot: "2815634434", quantity: 1 },
    )).rejects.toBeInstanceOf(DuplicateLotError);

    await expect(createEntry(
      inventory.id,
      { side: "DE", bay: "21", layer: "A7", lot: "2815634434", quantity: 1 },
      { allowDuplicate: true },
    )).resolves.toMatchObject({ duplicateConfirmed: true, layer: "A7" });

    expect(await listActiveEntries(inventory.id)).toHaveLength(2);
  });

  it("valida camada apenas quando informada e mantém lote oficial obrigatório", () => {
    expect(validateEntryDraft({ side: "EF", bay: "", layer: "A1", lot: "2712345678", quantity: 1 })).toMatch(/vão/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: " ", quantity: 1 })).toMatch(/lote/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: "ABC", quantity: 1 })).toMatch(/10 números/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: "2712345678", quantity: 0 })).toMatch(/inteiro positivo/);
    expect(validateEntryDraft({ side: "EF", bay: "1", lot: "2712345678", quantity: 1 })).toBeUndefined();
    expect(validateEntryDraft({ side: "EF", bay: "1", layer: "A10", lot: "2712345678", quantity: 1 })).toBeUndefined();
  });

  it("permite adicionar e remover camada na edição sem mudar a regra de duplicidade", async () => {
    const inventory = await createInventory("2026-09-14");
    const created = await createEntry(inventory.id, { side: "EF", bay: "15", lot: "2712345680", quantity: 4 });

    await expect(createEntry(inventory.id, { side: "DE", bay: "21", layer: "A1", lot: "2712345680", quantity: 1 }))
      .rejects.toBeInstanceOf(DuplicateLotError);

    const withLayer = await updateEntry(created.id, { side: "EF", bay: "15", layer: "A3", lot: "2712345680", quantity: 4 });
    expect(withLayer.layer).toBe("A3");

    const withoutLayer = await updateEntry(withLayer.id, { side: "EF", bay: "15", layer: null, lot: "2712345680", quantity: 4 });
    expect(withoutLayer.layer).toBeUndefined();
  });
});
