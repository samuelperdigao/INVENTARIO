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
    entries: [{ id: entryId, inventoryId, side: "EF", bay: "01", layer: "A1", lot: "2712345678", quantity: 3, duplicateConfirmed: false, createdAt: timestamp, updatedAt: timestamp, revision, syncBaseRevision: revision, tombstone: false, deletedAt: null }],
    acknowledged: { inventory: true, entryIds: [entryId] },
    conflicts: [] as ServerConflict[],
  };
}

it("confirma alterações locais somente após a resposta idempotente do servidor", async () => {
  const inventory = await createInventory("2026-09-11");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "01", layer: "A1", lot: "2712345678", quantity: 3 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response(inventory.id, entry.id)), { status: 200 })));

  await syncInventory(inventory.id);

  expect((await db.inventories.get(inventory.id))?.syncStatus).toBe("SYNCED");
  expect((await db.entries.get(entry.id))?.syncStatus).toBe("SYNCED");
  expect((await db.entries.get(entry.id))?.layer).toBe("A1");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/sync"), expect.objectContaining({ headers: expect.objectContaining({ "X-Inventory-Sync-Token": inventory.syncToken }) }));
});

it("envia camada nula explicitamente e preserva a ausência de camada recebida", async () => {
  const inventory = await createInventory("2026-09-14");
  const entry = await createEntry(inventory.id, { side: "DE", bay: "21", lot: "2812345678", quantity: 2 });
  const serverResponse = {
    ...response(inventory.id, entry.id),
    entries: response(inventory.id, entry.id).entries.map((remoteEntry) => ({ ...remoteEntry, layer: null })),
  };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(serverResponse), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await syncInventory(inventory.id);

  const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { entries: Array<{ layer: string | null }> };
  expect(requestBody.entries[0].layer).toBeNull();
  expect((await db.entries.get(entry.id))?.layer).toBeNull();
});

it("mantém as duas versões quando o servidor reporta um conflito", async () => {
  const inventory = await createInventory("2026-09-11");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "01", layer: "A1", lot: "2712345700", quantity: 3 });
  const server = response(inventory.id, entry.id, 2);
  server.entries = [];
  server.acknowledged = { inventory: false, entryIds: [] };
  server.conflicts = [{
    entityType: "entry" as const,
    entityId: entry.id,
    serverRecord: { id: entry.id, inventoryId: inventory.id, side: "DE", bay: "02", layer: "A2", lot: "2712345701", quantity: 5, duplicateConfirmed: false, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z", revision: 2, syncBaseRevision: 2, tombstone: false, deletedAt: null },
  }];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(server), { status: 200 })));

  const result = await syncInventory(inventory.id);
  const conflicts = await listSyncConflicts(inventory.id);
  expect(result.conflicts).toBe(1);
  expect(conflicts[0].localRecord).toMatchObject({ lot: "2712345700", layer: "A1" });
  expect(conflicts[0].serverRecord).toMatchObject({ lot: "2712345701", layer: "A2" });
  expect((await db.entries.get(entry.id))?.syncStatus).toBe("ERROR");

  await resolveConflict(inventory.id, conflicts[0].id, "local");
  expect((await db.entries.get(entry.id))).toMatchObject({ lot: "2712345700", layer: "A1", revision: 3, syncBaseRevision: 2, syncStatus: "PENDING" });
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

it("não marca uma resposta repetida como mudança visual", async () => {
  const inventory = await createInventory("2026-09-15");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "01", lot: "2712345680", quantity: 1 });
  const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify(response(inventory.id, entry.id)), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await syncInventory(inventory.id);
  const secondResult = await syncInventory(inventory.id);

  expect(secondResult.changed).toBe(false);
  expect(secondResult.remoteChanged).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("reaproveita o mesmo sync quando uma segunda chamada chega durante a primeira", async () => {
  const inventory = await createInventory("2026-09-16");
  const entry = await createEntry(inventory.id, { side: "DE", bay: "02", lot: "2712345681", quantity: 2 });
  let resolveRequest: ((value: Response) => void) | undefined;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
  vi.stubGlobal("fetch", fetchMock);

  const first = syncInventory(inventory.id);
  const second = syncInventory(inventory.id);
  expect(second).toBe(first);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  resolveRequest?.(new Response(JSON.stringify(response(inventory.id, entry.id)), { status: 200 }));
  await first;

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("não sobrescreve um lançamento feito enquanto a requisição estava em voo", async () => {
  const inventory = await createInventory("2026-09-17");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "03", lot: "2712345682", quantity: 2 });
  let resolveRequest: ((value: Response) => void) | undefined;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
  vi.stubGlobal("fetch", fetchMock);

  const syncing = syncInventory(inventory.id);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const newerEntry = await createEntry(inventory.id, { side: "DE", bay: "04", lot: "2712345683", quantity: 4 });
  resolveRequest?.(new Response(JSON.stringify(response(inventory.id, entry.id)), { status: 200 }));
  await syncing;

  expect((await db.entries.get(newerEntry.id))?.syncStatus).toBe("PENDING");
  expect((await db.inventories.get(inventory.id))).toMatchObject({ revision: 3, syncStatus: "PENDING" });
});

it("faz somente uma leitura quando o servidor já finalizou durante um polling", async () => {
  const inventory = await createInventory("2026-09-18");
  await createEntry(inventory.id, { side: "EF", bay: "05", lot: "2712345684", quantity: 1 });
  const finishedResponse = {
    cursor: 4,
    inventory: { id: inventory.id, date: "2026-09-18", status: "FINISHED", createdAt: inventory.createdAt, updatedAt: inventory.updatedAt, revision: 3, syncBaseRevision: 3, tombstone: false, deletedAt: null },
    entries: [],
    acknowledged: { inventory: false, entryIds: [] },
    conflicts: [],
    participationCode: null,
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(finishedResponse), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await syncInventory(inventory.id, { background: true });

  expect(result.serverStatus).toBe("FINISHED");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((await db.inventories.get(inventory.id))?.syncStatus).toBe("ERROR");
  expect(await listSyncConflicts(inventory.id)).toHaveLength(1);
});
