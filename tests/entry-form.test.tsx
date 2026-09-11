import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { EntryForm } from "@/components/entry-form";

async function fillValidForm(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "EF" }));
  await user.type(screen.getByLabelText("Vão"), "12");
  await user.type(screen.getByLabelText("Lote"), "0009");
  await user.type(screen.getByLabelText("Quantidade de peças"), "3");
}

it("valida lado, vão, lote e quantidade", async () => {
  render(<EntryForm onSave={vi.fn()} onCancelEdit={vi.fn()} />);
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Selecione o lado");

  await userEvent.setup().click(screen.getByRole("button", { name: "EF" }));
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Informe o vão");

  await userEvent.setup().type(screen.getByLabelText("Vão"), "1");
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Informe o lote");

  await userEvent.setup().type(screen.getByLabelText("Lote"), "L");
  await userEvent.setup().type(screen.getByLabelText("Quantidade de peças"), "0");
  fireEvent.submit(screen.getByRole("button", { name: "Adicionar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("inteiro positivo");
});

it("retém lado e vão, limpa lote/quantidade e focaliza lote depois de salvar", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<EntryForm onSave={onSave} onCancelEdit={vi.fn()} />);
  await fillValidForm();
  await userEvent.setup().click(screen.getByRole("button", { name: "Adicionar" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ side: "EF", bay: "12", lot: "0009", quantity: 3 }, undefined));
  expect(screen.getByRole("button", { name: "EF" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Vão")).toHaveValue("12");
  expect(screen.getByLabelText("Lote")).toHaveValue("");
  expect(screen.getByLabelText("Quantidade de peças")).toHaveValue("");
  expect(document.activeElement).toBe(screen.getByLabelText("Lote"));
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

