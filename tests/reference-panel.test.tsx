import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi, afterEach } from "vitest";

import { ReferencePanel } from "@/components/reference-panel";
import { db } from "@/lib/db";
import * as referenceClient from "@/lib/reference-client";
import * as syncClient from "@/lib/sync-client";
import type { Inventory, InventoryReference, ReferencePreview } from "@/lib/models";


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
    { id: "inventory:2712345678", inventoryId: inventory.id, lotNumber: "2712345678" },
    { id: "inventory:2812345678", inventoryId: inventory.id, lotNumber: "2812345678" },
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
  expect(within(table).getByText("2712345678")).toBeInTheDocument();
  expect(within(table).getByText("2812345678")).toBeInTheDocument();
  expect(within(table).getAllByText("Ainda não encontrado")).toHaveLength(2);

  await userEvent.setup().type(screen.getByLabelText("Buscar lote"), "281");
  await waitFor(() => expect(within(table).queryByText("2712345678")).not.toBeInTheDocument());
  expect(within(table).getByText("2812345678")).toBeInTheDocument();
});

it("mostra linhas verificadas na prévia sem avisar sobre zeros à esquerda", async () => {
  setOnline(false);
  const preview: ReferencePreview = {
    originalFilename: "materia-prima.xlsx",
    sourceType: "SAP_EXCEL",
    headerRow: 1,
    columns: [{ index: 1, label: "Lote" }],
    selectedColumn: 1,
    selectedColumnLabel: "Lote",
    requiresColumnSelection: false,
    totalRows: 370,
    validLotOccurrences: 370,
    uniqueLots: 370,
    duplicateRows: 0,
    ignoredRows: 0,
    sample: ["2712345678"],
    warnings: [],
  };
  vi.spyOn(referenceClient, "previewReference").mockResolvedValue(preview);
  vi.spyOn(syncClient, "syncInventory").mockResolvedValue({
    conflicts: 0,
    received: 0,
    changed: false,
    remoteChanged: false,
  });
  render(<ReferencePanel inventory={inventory} onChanged={vi.fn().mockResolvedValue(undefined)} />);

  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Importar planilha SAP" }));
  await user.upload(screen.getByLabelText("Arquivo Excel (.xlsx)"), new File(["xlsx"], "materia-prima.xlsx"));
  setOnline(true);
  await user.click(screen.getByRole("button", { name: "Pré-visualizar importação" }));

  await screen.findByLabelText("Prévia da importação");
  expect(screen.getByText("370 linhas verificadas")).toBeInTheDocument();
  expect(screen.getByText("Arquivo carregado: materia-prima.xlsx")).toBeInTheDocument();
  expect(screen.queryByText(/zeros à esquerda/i)).not.toBeInTheDocument();
});
