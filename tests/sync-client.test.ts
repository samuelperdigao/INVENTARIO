import { afterEach, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { createEntry, createInventory } from "@/lib/inventory-repository";
import { listSyncConflicts, resolveConflict, syncInventory } from "@/lib/sync-client";

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
