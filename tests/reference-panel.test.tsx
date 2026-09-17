import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi, afterEach } from "vitest";

import { ReferencePanel } from "@/components/reference-panel";
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

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

async function seedReference(): Promise<void> {
  const reference: InventoryReference = {
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
  await db.inventoryReferences.put(reference);
  await db.referenceLots.bulkPut([
    { id: "inventory:000123", inventoryId: inventory.id, lotNumber: "000123" },
    { id: "inventory:000456", inventoryId: inventory.id, lotNumber: "000456" },
  ]);
}

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

it("explica que a referência é opcional e mantém a coleta liberada", async () => {
  setOnline(false);
  render(<ReferencePanel inventory={inventory} onChanged={vi.fn().mockResolvedValue(undefined)} />);

  await screen.findByText(/Você pode continuar sem referência e registrar normalmente/);
  await userEvent.setup().click(screen.getByRole("button", { name: "Continuar sem planilha SAP" }));

  expect(screen.getByRole("status")).toHaveTextContent("Sem referência: a coleta física continua disponível normalmente.");
});

it("exibe a referência cacheada, tabela desktop e busca paginada", async () => {
  setOnline(false);
  await seedReference();
  render(<ReferencePanel inventory={inventory} onChanged={vi.fn().mockResolvedValue(undefined)} />);

  await screen.findByText("Planilha importada");
  await userEvent.setup().click(screen.getByRole("button", { name: "Visualizar lotes" }));
  const table = screen.getByRole("table");
  expect(within(table).getByText("000123")).toBeInTheDocument();
  expect(within(table).getByText("000456")).toBeInTheDocument();
  expect(within(table).getAllByText("Ainda não encontrado")).toHaveLength(2);

  await userEvent.setup().type(screen.getByLabelText("Buscar lote"), "456");
  await waitFor(() => expect(within(table).queryByText("000123")).not.toBeInTheDocument());
  expect(within(table).getByText("000456")).toBeInTheDocument();
});
