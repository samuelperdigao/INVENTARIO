import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { EntryForm } from "@/components/entry-form";
import { DuplicateLotError } from "@/lib/inventory-repository";
import type { InventoryEntry } from "@/lib/models";

async function fillValidForm(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "EF" }));
  await user.type(screen.getByLabelText("Vão"), "12");
  await user.selectOptions(screen.getByLabelText("Camada (opcional)"), "A2");
  await user.type(screen.getByLabelText("Lote"), "0009");
  await user.type(screen.getByLabelText("Quantidade de peças"), "3");
}

it("valida lado, vão, lote e quantidade sem exigir camada", async () => {
  render(<EntryForm onSave={vi.fn()} onCancelEdit={vi.fn()} />);
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Selecione o lado");

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "EF" }));
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Informe o vão");

  await user.type(screen.getByLabelText("Vão"), "1");
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Informe o lote");

  await user.type(screen.getByLabelText("Lote"), "1");
  await user.type(screen.getByLabelText("Quantidade de peças"), "0");
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("inteiro positivo");
});

it("salva lançamento sem camada quando os demais campos são válidos", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "DE" }));
  await user.type(screen.getByLabelText("Vão"), "21");
  await user.type(screen.getByLabelText("Lote"), "123456");
  await user.type(screen.getByLabelText("Quantidade de peças"), "7");
  await user.click(screen.getByRole("button", { name: "Adicionar" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ side: "DE", bay: "21", layer: undefined, lot: "123456", quantity: 7 }, undefined, false));
  expect(screen.getByLabelText("Camada (opcional)")).toHaveValue("");
});

it("retém lado, vão e camada, limpa lote/quantidade e focaliza lote depois de salvar", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} />);
  await fillValidForm();
  await userEvent.setup().click(screen.getByRole("button", { name: "Adicionar" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ side: "EF", bay: "12", layer: "A2", lot: "0009", quantity: 3 }, undefined, false));
  expect(screen.getByRole("button", { name: "EF" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Vão")).toHaveValue("12");
  expect(screen.getByLabelText("Camada (opcional)")).toHaveValue("A2");
  expect(screen.getByLabelText("Lote")).toHaveValue("");
  expect(screen.getByLabelText("Quantidade de peças")).toHaveValue("");
  expect(document.activeElement).toBe(screen.getByLabelText("Lote"));
});

it("mantém lote como texto e remove caracteres não numéricos", async () => {
  render(<EntryForm onSave={vi.fn()} onCancelEdit={vi.fn()} />);
  const lot = screen.getByLabelText("Lote");
  expect(lot).toHaveAttribute("inputmode", "numeric");
  expect(lot).toHaveAttribute("type", "text");
  await userEvent.setup().type(lot, "00A12-3");
  expect(lot).toHaveValue("00123");
});

it("exibe confirmação quando o lote já existe e salva somente após confirmação", async () => {
  const duplicate: InventoryEntry = {
    id: "existing",
    inventoryId: "inventory",
    side: "DE",
    bay: "15",
    layer: "A1",
    lot: "0009",
    quantity: 19,
    createdByName: "João Silva",
    createdAt: "2026-09-12T08:00:00Z",
    updatedAt: "2026-09-12T08:00:00Z",
    revision: 1,
    syncBaseRevision: 1,
    syncStatus: "SYNCED",
    tombstone: false,
  };
  const onSave = vi.fn()
    .mockRejectedValueOnce(new DuplicateLotError([duplicate]))
    .mockResolvedValueOnce(undefined);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} />);
  await fillValidForm();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Adicionar" }));

  expect(await screen.findByRole("dialog", { name: "Lote já registrado" })).toBeInTheDocument();
  expect(screen.getByText("João Silva")).toBeInTheDocument();
  expect(screen.getByText("Camada: A1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Adicionar mesmo assim" }));

  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ side: "EF", bay: "12", layer: "A2", lot: "0009", quantity: 3 }, undefined, true));
});

it("preserva o formulário quando o armazenamento falha", async () => {
  const onSave = vi.fn().mockRejectedValue(new Error("QuotaExceededError"));
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} />);
  await fillValidForm();
  await userEvent.setup().click(screen.getByRole("button", { name: "Adicionar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Registro não salvo");
  expect(screen.getByLabelText("Lote")).toHaveValue("0009");
  expect(screen.getByLabelText("Quantidade de peças")).toHaveValue("3");
});

it("consulta a referência sem bloquear o salvamento local", async () => {
  let resolveReference: ((value: boolean | null) => void) | undefined;
  const referenceChecker = vi.fn(() => new Promise<boolean | null>((resolve) => { resolveReference = resolve; }));
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} referenceChecker={referenceChecker} />);
  await fillValidForm();

  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ side: "EF", bay: "12", layer: "A2", lot: "0009", quantity: 3 }, undefined, false));
  expect(referenceChecker).toHaveBeenCalledWith("0009");
  expect(screen.getByLabelText("Lote")).toHaveValue("");

  resolveReference?.(true);
});

it("exibe lote fora da referência sem impedir o lançamento", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const referenceChecker = vi.fn().mockResolvedValue(false);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} referenceChecker={referenceChecker} />);
  await fillValidForm();
  fireEvent.blur(screen.getByLabelText("Lote"));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("não consta na referência SAP"));
  await userEvent.setup().click(screen.getByRole("button", { name: "Adicionar" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
});
