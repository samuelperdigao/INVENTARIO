import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { AdminPanel } from "@/components/admin-panel";
import type { AdminInventory } from "@/lib/admin-client";

const { mockRouter, adminGet, adminPost, admin } = vi.hoisted(() => ({
  mockRouter: { replace: vi.fn(), push: vi.fn() },
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  admin: { id: "admin", email: "admin@example.com", displayName: "Admin", recoveryPinConfigured: true, teams: [], systemAdmin: true },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

vi.mock("@/lib/auth-client", () => ({
  restoreSession: vi.fn().mockResolvedValue(admin),
  refreshCurrentUser: vi.fn().mockResolvedValue(admin),
}));

vi.mock("@/lib/admin-client", () => ({
  adminGet, adminPost, adminUpload: vi.fn(), adminDownload: vi.fn(),
}));

function inventory(index: number): AdminInventory {
  return {
    id: `inv-${index}`, date: "2026-10-26", status: "OPEN", revision: index + 1, operationalGeneration: 1,
    tombstone: false, createdAt: "2026-10-26T10:00:00Z", ownerName: `Teste ${index}`,
    recordCount: 0, lotCount: 0, pieceCount: 0, reportVersion: 0,
  };
}

let active: AdminInventory[];

beforeEach(() => {
  active = Array.from({ length: 30 }, (_, index) => inventory(index));
  adminGet.mockReset(); adminPost.mockReset();
  adminGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/overview")) return { total: 0, open: 0, finished: 0, lots: 0, pieces: 0, byPeriod: [], recent: [], activities: [] };
    if (path.startsWith("/users")) return [];
    if (path.startsWith("/inventories?")) {
      const params = new URLSearchParams(path.split("?")[1]);
      const size = Number(params.get("pageSize") ?? 25);
      const page = Number(params.get("page") ?? 1);
      return { items: active.slice((page - 1) * size, page * size), total: active.length, page, pageSize: size };
    }
    throw new Error(`rota inesperada ${path}`);
  });
  adminPost.mockImplementation(async (_path: string, body: { items: { inventoryId: string }[] }) => {
    const ids = new Set(body.items.map((item) => item.inventoryId));
    active = active.filter((item) => !ids.has(item.id));
    return { deleted: ids.size };
  });
});

async function openInventories() {
  const user = userEvent.setup();
  render(<AdminPanel />);
  // A navegação aparece na lateral e na barra móvel; ambas trocam a mesma seção.
  await user.click((await screen.findAllByRole("button", { name: "Todos os inventários" }))[0]);
  await screen.findByText("Teste 0");
  return user;
}

it("seleciona inventários individualmente e exclui em lote após confirmação", async () => {
  const user = await openInventories();
  await user.click(screen.getByRole("checkbox", { name: /Teste 0$/ }));
  await user.click(screen.getByRole("checkbox", { name: /Teste 2$/ }));
  expect(screen.getByText("2 selecionado(s)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Excluir selecionados (2)" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir 2 inventário(s)" });
  expect(adminPost).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Sim, excluir 2" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(adminPost).toHaveBeenCalledWith("/inventories/delete-batch", { items: [
    { inventoryId: "inv-0", expectedRevision: 1, expectedGeneration: 1 },
    { inventoryId: "inv-2", expectedRevision: 3, expectedGeneration: 1 },
  ] });
  await waitFor(() => expect(screen.queryByText("Teste 0")).not.toBeInTheDocument());
  expect(screen.getByText("Nenhum selecionado")).toBeInTheDocument();
});

it("seleciona a página e depois todos os resultados do filtro", async () => {
  const user = await openInventories();
  await user.click(screen.getByRole("checkbox", { name: "Selecionar esta página" }));
  expect(screen.getByText("25 selecionado(s)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Selecionar todos os 30 resultados" }));
  await screen.findByText("30 selecionado(s)");
  await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
  expect(screen.getByText("Nenhum selecionado")).toBeInTheDocument();
});

it("mantém a seleção e mostra o erro quando a exclusão é recusada", async () => {
  adminPost.mockRejectedValueOnce(new Error("Nenhum inventário foi excluído. O inventário foi alterado."));
  const user = await openInventories();
  await user.click(screen.getByRole("checkbox", { name: /Teste 1$/ }));
  await user.click(screen.getByRole("button", { name: "Excluir selecionados (1)" }));
  await user.click(screen.getByRole("button", { name: "Sim, excluir 1" }));
  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Nenhum inventário foi excluído.");
  expect(screen.getByText("1 selecionado(s)")).toBeInTheDocument();
});
