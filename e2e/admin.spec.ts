import { expect, test, type Page } from "@playwright/test";

// As rotas simuladas precisam receber as requisições sem interceptação do service worker.
test.use({ serviceWorkers: "block" });

const inventoryId = "00000000-0000-4000-8000-000000000521";
const entryId = "00000000-0000-4000-8000-000000000522";

async function mockAdmin(page: Page, systemAdmin = true) {
  const user = { id: "00000000-0000-4000-8000-000000000523", email: "admin@example.com",
    displayName: "Administração", systemAdmin, recoveryPinConfigured: true, teams: [] };
  let inventory: {
    id: string; date: string; status: "OPEN" | "FINISHED"; revision: number; operationalGeneration: number;
    tombstone: boolean; deletedAt?: string; finalizedAt?: string; recordCount: number; lotCount: number;
    pieceCount: number; reportVersion: number; ownerName: string; ownerEmail: string; ownerUserId: string;
    createdAt: string;
  } = {
    id: inventoryId, date: "2026-09-23", status: "OPEN", revision: 4,
    operationalGeneration: 1, tombstone: false, recordCount: 1,
    lotCount: 1, pieceCount: 8, reportVersion: 0, ownerName: "Operador A",
    ownerEmail: "operador@example.com", ownerUserId: user.id, createdAt: "2026-09-23T12:00:00Z",
  };
  const reference = {
    reference: null, summary: { available: false, totalLots: 0, foundLots: 0, pendingLots: 0,
      outsideReferenceLots: 0, fragmentedLots: 0, physicalDistinctLots: 1 },
    lots: [], outsideLots: [], page: 1, pageSize: 50, totalMatchingLots: 0, totalPages: 0,
  };
  const adminActions: { path: string; body: unknown }[] = [];
  await page.route("**/backend-api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/backend-api/, "");
    let body: object = {};
    let status = 200;
    if (route.request().method() === "POST" && (path === `/api/v1/admin/inventories/${inventoryId}/delete`
      || path === `/api/v1/admin/inventories/${inventoryId}/finalize`)) {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      adminActions.push({ path, body: payload });
      if (path.endsWith("/delete")) inventory = { ...inventory, tombstone: true, deletedAt: "2026-09-23T13:00:00Z" };
      else inventory = { ...inventory, status: "FINISHED", revision: inventory.revision + 1,
        reportVersion: inventory.reportVersion + 1, finalizedAt: "2026-09-23T13:00:00Z" };
      body = inventory;
    }
    else if (path === "/api/v1/auth/refresh") body = { user, accessToken: "session-for-ui-test" };
    else if (path === "/api/v1/auth/me") body = user;
    else if (!systemAdmin) { body = { detail: "Acesso administrativo não autorizado." }; status = 403; }
    else if (path === "/api/v1/admin/overview") body = {
      total: 1, open: 1, finished: 0, lots: 1, pieces: 8,
      recent: [inventory], activities: [], byPeriod: [{ period: "2026-09", count: 1 }],
    };
    else if (path === "/api/v1/admin/users") body = [{ id: user.id, name: user.displayName, email: user.email }];
    else if (path === "/api/v1/admin/inventories") body = { items: [inventory], total: 1, page: 1, pageSize: 25 };
    else if (path === `/api/v1/admin/inventories/${inventoryId}`) body = {
      ...inventory, entries: [{ id: entryId, inventoryId, side: "DE", bay: "15", layer: "A1",
        lot: "2712345678", quantity: 8, revision: 1, createdByName: "Operador A" }],
      entryTotal: 1, entryPage: 1, entryPageSize: 100,
      participants: [], reference,
    };
    else if (path === `/api/v1/admin/inventories/${inventoryId}/reference`) body = reference;
    else if (path === `/api/v1/admin/inventories/${inventoryId}/versions`) body = inventory.reportVersion ? [
      { version: inventory.reportVersion, createdAt: inventory.finalizedAt, revision: inventory.revision,
        operationalGeneration: inventory.operationalGeneration },
    ] : [];
    else if (path === "/api/v1/admin/audit") body = { items: [], total: 0 };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return adminActions;
}

async function openAdminInventory(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await page.getByRole("link", { name: /Operador A.*1 lotes/ }).click();
  await expect(page.getByRole("heading", { name: "Lançamentos" })).toBeVisible();
}

for (const width of [390, 1366]) {
  test(`painel administrativo fica utilizável em ${width}px`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message.replaceAll(inventoryId, "[inventário]")));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text().replaceAll(inventoryId, "[inventário]")); });
    page.on("requestfailed", (request) => browserErrors.push(`${new URL(request.url()).pathname.replaceAll(inventoryId, "[inventário]")}: ${request.failure()?.errorText}`));
    await page.setViewportSize({ width, height: 780 });
    await mockAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("Inventários recentes")).toBeVisible();
    await page.getByRole("link", { name: /Operador A.*1 lotes/ }).click();
    try {
      await page.getByRole("heading", { name: "Lançamentos" }).waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      throw new Error(`Detalhe indisponível em ${page.url().replaceAll(inventoryId, "[inventário]")}: ${(await page.locator("body").innerText()).slice(0, 1200)}; erros: ${browserErrors.slice(-5).join(" | ")}`);
    }
    await page.getByRole("button", { name: "Corrigir" }).click();
    const dialog = page.getByRole("dialog", { name: "Corrigir lançamento" });
    await expect(dialog.getByRole("textbox", { name: "Lote" })).toHaveValue("2712345678");
    const confirm = dialog.getByRole("button", { name: "Confirmar alteração" });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("conta comum recebe acesso negado mesmo ao abrir a rota diretamente", async ({ page }) => {
  await mockAdmin(page, false);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Acesso não autorizado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir inventário" })).toHaveCount(0);
});

test("exclusão administrativa usa somente Sim ou Cancelar e envia revisão esperada", async ({ page }) => {
  const actions = await mockAdmin(page);
  await openAdminInventory(page);
  await page.getByRole("button", { name: "Excluir inventário" }).click();
  let dialog = page.getByRole("dialog", { name: "Excluir inventário" });
  await expect(dialog.getByText("Tem certeza que deseja excluir este inventário?", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  expect(actions.filter((action) => action.path.endsWith("/delete"))).toHaveLength(0);

  await page.getByRole("button", { name: "Excluir inventário" }).click();
  dialog = page.getByRole("dialog", { name: "Excluir inventário" });
  await dialog.getByRole("button", { name: "Sim, excluir" }).click();
  await expect.poll(() => actions.filter((action) => action.path.endsWith("/delete")).length).toBe(1);
  expect(actions.find((action) => action.path.endsWith("/delete"))?.body).toEqual({
    expectedRevision: 4, expectedGeneration: 1,
  });
  await expect(page.getByText("Excluído", { exact: true })).toBeVisible();
});

test("administrador finaliza somente inventário aberto com confirmação simples", async ({ page }) => {
  const actions = await mockAdmin(page);
  await openAdminInventory(page);
  await page.getByRole("button", { name: "Finalizar inventário" }).click();
  let dialog = page.getByRole("dialog", { name: "Finalizar inventário" });
  await expect(dialog.getByText("Tem certeza que deseja finalizar este inventário?", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  expect(actions.filter((action) => action.path.endsWith("/finalize")).length).toBe(0);

  await page.getByRole("button", { name: "Finalizar inventário" }).click();
  dialog = page.getByRole("dialog", { name: "Finalizar inventário" });
  await dialog.getByRole("button", { name: "Sim, finalizar" }).click();
  await expect.poll(() => actions.filter((action) => action.path.endsWith("/finalize")).length).toBe(1);
  expect(actions.find((action) => action.path.endsWith("/finalize"))?.body).toEqual({
    expectedRevision: 4, expectedGeneration: 1,
  });
  await expect(page.getByRole("button", { name: "Reabrir inventário" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar inventário" })).toHaveCount(0);
});
