import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  getAuthenticatedSession: vi.fn().mockResolvedValue({
    accessToken: "reference-test-access-token",
    user: { id: "user", email: "user@example.com", displayName: "Usuário", teams: [] },
  }),
}));

import { checkReferenceLot, getReferenceState, importReference, removeReference } from "@/lib/reference-client";
import { db } from "@/lib/db";
import type { Inventory, InventoryReference } from "@/lib/models";


const inventory: Inventory = {
  id: "inventory",
  date: "2026-09-16",
  status: "OPEN",
  syncToken: "inventory-sync-token-with-more-than-32-characters",
  createdAt: "2026-09-16T10:00:00.000Z",
  updatedAt: "2026-09-16T10:00:00.000Z",
  revision: 1,
  syncBaseRevision: 0,
  syncStatus: "PENDING",
  tombstone: false,
};

const metadata: InventoryReference = {
  id: inventory.id,
  inventoryId: inventory.id,
  sourceType: "SAP_EXCEL",
  originalFilename: "sap.xlsx",
  importedAt: "2026-09-16T10:00:00.000Z",
  updatedAt: "2026-09-16T10:00:00.000Z",
  totalLots: 2,
  revision: 1,
  status: "ACTIVE",
  lotsComplete: true,
};

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setOnline(true);
  await db.inventoryReferences.clear();
  await db.referenceLots.clear();
  await db.entries.clear();
});

it("mapeia reference null da API para estado local sem referência", async () => {
  setOnline(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    reference: null,
    summary: { available: false, totalLots: 0, foundLots: 0, pendingLots: 0, outsideReferenceLots: 0, fragmentedLots: 0, physicalDistinctLots: 0 },
    lots: [],
    page: 1,
    pageSize: 50,
    totalMatchingLots: 0,
    totalPages: 0,
  }), { status: 200 })));

  const state = await getReferenceState(inventory);

  expect(state.reference).toBeUndefined();
  expect(state.summary.available).toBe(false);
  expect(await db.inventoryReferences.get(inventory.id)).toBeUndefined();
});

it("consulta o cache offline, calcula a situação física e responde ao pertencimento", async () => {
  setOnline(false);
  await db.inventoryReferences.put(metadata);
  await db.referenceLots.bulkPut([
    { id: "inventory:000123", inventoryId: inventory.id, lotNumber: "000123" },
    { id: "inventory:000456", inventoryId: inventory.id, lotNumber: "000456" },
  ]);
  await db.entries.put({
    id: "entry",
    inventoryId: inventory.id,
    side: "DE",
    bay: "15",
    lot: "000123",
    quantity: 19,
    createdAt: "2026-09-16T10:00:00.000Z",
    updatedAt: "2026-09-16T10:00:00.000Z",
    revision: 1,
    syncBaseRevision: 0,
    syncStatus: "PENDING",
    tombstone: false,
  });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const state = await getReferenceState(inventory, 1, "000");

  expect(state.summary).toMatchObject({ totalLots: 2, foundLots: 1, pendingLots: 1, outsideReferenceLots: 0 });
  expect(state.lots[0]).toMatchObject({ lotNumber: "000123", foundPhysically: true, physicalQuantity: 19 });
  expect(await checkReferenceLot(inventory, "000123")).toBe(true);
  expect(await checkReferenceLot(inventory, "000999")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("descarta lotes cacheados quando a referência central muda de revisão", async () => {
  setOnline(true);
  await db.inventoryReferences.put(metadata);
  await db.referenceLots.put({ id: "inventory:000123", inventoryId: inventory.id, lotNumber: "000123" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    reference: { ...metadata, updatedAt: "2026-09-16T12:00:00.000Z", totalLots: 1, revision: 2 },
    summary: { available: true, totalLots: 1, foundLots: 0, pendingLots: 1, outsideReferenceLots: 0, fragmentedLots: 0, physicalDistinctLots: 0 },
    lots: [{ lotNumber: "000456", foundPhysically: false, physicalQuantity: 0, physicalOccurrences: 0, fragmented: false }],
    page: 1,
    pageSize: 50,
    totalMatchingLots: 1,
    totalPages: 1,
  }), { status: 200 })));

  const state = await getReferenceState(inventory);

  expect(state.reference?.revision).toBe(2);
  expect(await db.referenceLots.where("inventoryId").equals(inventory.id).count()).toBe(0);
});

it("persiste os números da importação e limpa o cache ao remover", async () => {
  setOnline(true);
  const response = {
    reference: {
      sourceType: "SAP_EXCEL",
      originalFilename: "nova.xlsx",
      importedAt: "2026-09-16T11:00:00.000Z",
      updatedAt: "2026-09-16T11:00:00.000Z",
      totalLots: 2,
      revision: 3,
    },
    importSummary: { totalRows: 2, validLotOccurrences: 2, uniqueLots: 2, duplicateRows: 0, ignoredRows: 0, sample: ["000123", "000456"], warnings: [] },
    lotNumbers: ["000123", "000456"],
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const file = new File(["xlsx"], "nova.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const imported = await importReference(inventory, file, 1);

  expect(imported.reference).toMatchObject({ originalFilename: "nova.xlsx", totalLots: 2, revision: 3, lotsComplete: true });
  expect((await db.referenceLots.where("inventoryId").equals(inventory.id).toArray()).map((lot) => lot.lotNumber)).toEqual(["000123", "000456"]);

  await removeReference(inventory);
  expect(await db.inventoryReferences.get(inventory.id)).toBeUndefined();
  expect(await db.referenceLots.where("inventoryId").equals(inventory.id).count()).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
