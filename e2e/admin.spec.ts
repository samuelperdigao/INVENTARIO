import { expect, test, type Page } from "@playwright/test";

const inventoryId = "00000000-0000-4000-8000-000000000521";
const entryId = "00000000-0000-4000-8000-000000000522";

async function mockAdmin(page: Page, systemAdmin = true) {
  const user = { id: "00000000-0000-4000-8000-000000000523", email: "admin@example.com",
    displayName: "Administração", systemAdmin, recoveryPinConfigured: true, teams: [] };
  const inventory = {
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
  await page.route("**/backend-api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/backend-api/, "");
    let body: object = {};
    let status = 200;
    if (path === "/api/v1/auth/refresh") body = { user, accessToken: "session-for-ui-test" };
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
    else if (path === `/api/v1/admin/inventories/${inventoryId}/versions`) body = [];
    else if (path === "/api/v1/admin/audit") body = { items: [], total: 0 };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

for (const width of [390, 1366]) {
  test(`painel administrativo fica utilizável em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockAdmin(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("Inventários recentes")).toBeVisible();
    await page.getByRole("link", { name: /Operador A.*1 lotes/ }).click();
    await expect(page.getByRole("heading", { name: "Lançamentos" })).toBeVisible();
    await page.getByRole("button", { name: "Corrigir" }).click();
    const dialog = page.getByRole("dialog", { name: "Corrigir lançamento" });
    await expect(dialog.getByLabel("Lote")).toHaveValue("2712345678");
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
