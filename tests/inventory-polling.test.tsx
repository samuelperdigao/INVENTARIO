import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { InventoryScreen } from "@/components/inventory-screen";
import { createInventory, markInventoryFinished } from "@/lib/inventory-repository";
import { db } from "@/lib/db";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { syncInventoryMock, listSyncConflictsMock } = vi.hoisted(() => ({
  syncInventoryMock: vi.fn(),
  listSyncConflictsMock: vi.fn(),
}));

vi.mock("@/lib/sync-client", () => ({
  INVENTORY_POLLING_INTERVAL_MS: 50,
  syncInventory: syncInventoryMock,
  listSyncConflicts: listSyncConflictsMock,
  resolveConflict: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

it("sincroniza em segundo plano sem trocar a tela e encerra o timer ao desmontar", async () => {
  listSyncConflictsMock.mockResolvedValue([]);
  syncInventoryMock.mockResolvedValue({ conflicts: 0, received: 0, changed: false, remoteChanged: false, serverStatus: "OPEN" });
  const inventory = await createInventory("2026-09-19");
  const view = render(<InventoryScreen inventoryId={inventory.id} />);

  await screen.findByRole("heading", { name: "Novo registro" });
  expect(syncInventoryMock).not.toHaveBeenCalled();
  await waitFor(() => expect(syncInventoryMock).toHaveBeenCalledWith(inventory.id, { background: true }), { timeout: 500 });
  const callsBeforeUnmount = syncInventoryMock.mock.calls.length;

  view.unmount();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  expect(syncInventoryMock).toHaveBeenCalledTimes(callsBeforeUnmount);
});

it("não consulta enquanto a página está oculta e retoma ao voltar para a tela", async () => {
  listSyncConflictsMock.mockResolvedValue([]);
  syncInventoryMock.mockResolvedValue({ conflicts: 0, received: 0, changed: false, remoteChanged: false, serverStatus: "OPEN" });
  const inventory = await createInventory("2026-09-20");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  render(<InventoryScreen inventoryId={inventory.id} />);

  await screen.findByRole("heading", { name: "Novo registro" });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  expect(syncInventoryMock).not.toHaveBeenCalled();

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
  await waitFor(() => expect(syncInventoryMock).toHaveBeenCalledWith(inventory.id, { background: true }), { timeout: 500 });
});

it("recebe reabertura administrativa mesmo com a tela finalizada aberta", async () => {
  listSyncConflictsMock.mockResolvedValue([]);
  const inventory = await createInventory("2026-09-23");
  await markInventoryFinished(inventory.id, 2);
  syncInventoryMock.mockImplementation(async () => {
    const current = await db.inventories.get(inventory.id);
    if (current) await db.inventories.put({ ...current, status: "OPEN", operationalGeneration: 2, revision: 3, syncStatus: "SYNCED" });
    return { conflicts: 0, received: 1, changed: true, remoteChanged: true, serverStatus: "OPEN" };
  });
  render(<InventoryScreen inventoryId={inventory.id} />);
  await waitFor(() => expect(syncInventoryMock).toHaveBeenCalled(), { timeout: 500 });
  await screen.findByRole("heading", { name: "Novo registro" });
  expect((await db.inventories.get(inventory.id))?.operationalGeneration).toBe(2);
});
