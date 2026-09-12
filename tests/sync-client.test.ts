import { afterEach, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { createEntry, createInventory } from "@/lib/inventory-repository";
import { joinInventoryByCode, listSyncConflicts, resolveConflict, syncInventory } from "@/lib/sync-client";

vi.mock("@/lib/auth-client", () => ({
  getAuthenticatedContext: vi.fn().mockResolvedValue({ accessToken: "test-access-token", teamId: "00000000-0000-4000-8000-000000000001" }),
}));

afterEach(() => vi.unstubAllGlobals());

type ServerConflict = { entityType: "entry"; entityId: string; serverRecord: Record<string, unknown> };

function response(inventoryId: string, entryId: string, revision = 1) {
  const timestamp = "2026-09-11T12:00:00.000Z";
  return {
    cursor: 2,
    inventory: { id: inventoryId, date: "2026-09-11", status: "OPEN", createdAt: timestamp, updatedAt: timestamp, revision: 2, syncBaseRevision: 2, tombstone: false, deletedAt: null },
    entries: [{ id: entryId, inventoryId, side: "EF", bay: "01", lot: "000123", quantity: 3, createdAt: timestamp, updatedAt: timestamp, revision, syncBaseRevision: revision, tombstone: false, deletedAt: null }],
    acknowledged: { inventory: true, entryIds: [entryId] },
    conflicts: [] as ServerConflict[],
  };
}

it("confirma alterações locais somente após a resposta idempotente do servidor", async () => {
  const inventory = await createInventory("2026-09-11");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "01", lot: "000123", quantity: 3 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response(inventory.id, entry.id)), { status: 200 })));

  await syncInventory(inventory.id);

  expect((await db.inventories.get(inventory.id))?.syncStatus).toBe("SYNCED");
  expect((await db.entries.get(entry.id))?.syncStatus).toBe("SYNCED");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/sync"), expect.objectContaining({ headers: expect.objectContaining({ "X-Inventory-Sync-Token": inventory.syncToken }) }));
});

it("mantém as duas versões quando o servidor reporta um conflito", async () => {
  const inventory = await createInventory("2026-09-11");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "01", lot: "LOCAL", quantity: 3 });
  const server = response(inventory.id, entry.id, 2);
  server.entries = [];
  server.acknowledged = { inventory: false, entryIds: [] };
  server.conflicts = [{
    entityType: "entry" as const,
    entityId: entry.id,
    serverRecord: { id: entry.id, inventoryId: inventory.id, side: "DE", bay: "02", lot: "CENTRAL", quantity: 5, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z", revision: 2, syncBaseRevision: 2, tombstone: false, deletedAt: null },
  }];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(server), { status: 200 })));

  const result = await syncInventory(inventory.id);
  const conflicts = await listSyncConflicts(inventory.id);
  expect(result.conflicts).toBe(1);
  expect(conflicts[0].localRecord).toMatchObject({ lot: "LOCAL" });
  expect(conflicts[0].serverRecord).toMatchObject({ lot: "CENTRAL" });
  expect((await db.entries.get(entry.id))?.syncStatus).toBe("ERROR");

  await resolveConflict(inventory.id, conflicts[0].id, "local");
  expect((await db.entries.get(entry.id))).toMatchObject({ lot: "LOCAL", revision: 3, syncBaseRevision: 2, syncStatus: "PENDING" });
});

it("entra por seis dígitos e guarda somente o token interno retornado", async () => {
  const inventoryId = "00000000-0000-4000-8000-000000000010";
  const entryId = "00000000-0000-4000-8000-000000000011";
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ inventoryId, accessToken: "secure-participant-token-with-more-than-32-characters" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...response(inventoryId, entryId), participationCode: "482731" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const joined = await joinInventoryByCode("482731");

  expect(joined.inventoryId).toBe(inventoryId);
  expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/inventories/join");
  expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ code: "482731" }));
  expect(await db.inventories.get(inventoryId)).toMatchObject({
    participationCode: "482731",
    syncToken: "secure-participant-token-with-more-than-32-characters",
  });
});
