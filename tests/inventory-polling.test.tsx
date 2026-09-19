import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { InventoryScreen } from "@/components/inventory-screen";
import { createInventory } from "@/lib/inventory-repository";

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
