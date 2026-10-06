import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { InventoryScreen } from "@/components/inventory-screen";
import { InventoryEntriesScreen } from "@/components/inventory-entries-screen";
import { db } from "@/lib/db";
import { createEntry, createInventory } from "@/lib/inventory-repository";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

vi.mock("@/lib/auth-client", () => ({
  getCurrentUser: vi.fn(() => ({ id: "screen-user", email: "screen@example.com", displayName: "Screen", recoveryPinConfigured: true, teams: [] })),
  restoreSession: vi.fn().mockResolvedValue({ id: "screen-user", email: "screen@example.com", displayName: "Screen", recoveryPinConfigured: true, teams: [] }),
}));

it("edita e exige confirmação antes de tombstonar um registro", async () => {
  const inventory = await createInventory("2026-09-11", "screen-user");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "1", layer: "A1", lot: "2712345678", quantity: 2 });
  const user = userEvent.setup();
  render(<InventoryEntriesScreen inventoryId={inventory.id} />);

  await screen.findByText("Lote 2712345678");
  await user.click(screen.getByRole("button", { name: "Editar" }));
  const lotInput = screen.getByLabelText("Lote");
  await user.clear(lotInput);
  await user.type(lotInput, "2812345678");
  await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(screen.getByText("Lote 2812345678")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(screen.getByRole("dialog", { name: "Excluir lançamento?" })).toBeInTheDocument();
  expect((await db.entries.get(entry.id))?.tombstone).toBe(false);

  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Excluir" }));
  await user.click(screen.getByRole("button", { name: "Excluir lançamento" }));
  await waitFor(async () => expect((await db.entries.get(entry.id))?.tombstone).toBe(true));
  await waitFor(() => expect(screen.queryByText("Lote 2812345678")).not.toBeInTheDocument());
});

it("exibe confirmação para lote repetido antes de aceitar a segunda ocorrência", async () => {
  const inventory = await createInventory("2026-09-14", "screen-user");
  const user = userEvent.setup();
  render(<InventoryScreen inventoryId={inventory.id} />);

  await screen.findByRole("heading", { name: "Novo registro" });
  await user.click(screen.getByRole("button", { name: "LP" }));
  await user.type(screen.getByLabelText("Vão"), "15");
  await user.type(screen.getByLabelText("Lote"), "2712345678");
  await user.type(screen.getByLabelText("Quantidade de peças"), "19");
  await user.click(screen.getByRole("button", { name: "Adicionar" }));
  await waitFor(() => expect(screen.getByText("1 registro(s)", { exact: true })).toBeInTheDocument(), { timeout: 5_000 });

  await user.click(screen.getByRole("button", { name: "LE" }));
  await user.clear(screen.getByLabelText("Vão"));
  await user.type(screen.getByLabelText("Vão"), "21");
  await user.type(screen.getByLabelText("Lote"), "2712345678");
  await user.clear(screen.getByLabelText("Quantidade de peças"));
  await user.type(screen.getByLabelText("Quantidade de peças"), "1");
  await user.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(await screen.findByRole("dialog", { name: "Lote já registrado" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Adicionar mesmo assim" }));
  await waitFor(() => expect(screen.getByText("2 registro(s)", { exact: true })).toBeInTheDocument(), { timeout: 5_000 });
});
