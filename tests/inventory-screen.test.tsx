import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { InventoryScreen } from "@/components/inventory-screen";
import { db } from "@/lib/db";
import { createEntry, createInventory } from "@/lib/inventory-repository";

it("edita e exige confirmação antes de tombstonar um registro", async () => {
  const inventory = await createInventory("2026-09-11");
  const entry = await createEntry(inventory.id, { side: "EF", bay: "1", layer: "A1", lot: "001", quantity: 2 });
  const user = userEvent.setup();
  const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<InventoryScreen inventoryId={inventory.id} />);

  await screen.findByText("Lote 001");
  await user.click(screen.getByRole("button", { name: "Editar" }));
  const lotInput = screen.getByLabelText("Lote");
  await user.clear(lotInput);
  await user.type(lotInput, "002");
  await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(screen.getByText("Lote 002")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(confirmation).toHaveBeenCalledOnce();
  expect((await db.entries.get(entry.id))?.tombstone).toBe(false);

  confirmation.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Excluir" }));
  await waitFor(async () => expect((await db.entries.get(entry.id))?.tombstone).toBe(true));
  await waitFor(() => expect(screen.queryByText("Lote 002")).not.toBeInTheDocument());
});
