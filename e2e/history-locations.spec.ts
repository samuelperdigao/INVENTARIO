import { expect, test } from "@playwright/test";

import { login, seedUsers } from "./helpers";

test("apresenta locais consolidados sem overflow nos viewports móveis", async ({ page }) => {
  test.setTimeout(180_000);
  const { ownerEmail } = seedUsers("history-locations");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await expect(page.getByRole("heading", { name: "Novo registro" })).toBeVisible();

  const entries: Array<{ side: "EF" | "DE"; bay: string; lot: string; quantity: number }> = [
    { side: "DE", bay: "15", lot: "800001", quantity: 20 },
    { side: "EF", bay: "3", lot: "800002", quantity: 3 },
    { side: "EF", bay: "15", lot: "800003", quantity: 19 },
    { side: "DE", bay: "21", lot: "800003", quantity: 1 },
    { side: "EF", bay: "10", lot: "800004", quantity: 10 },
    { side: "DE", bay: "10", lot: "800004", quantity: 10 },
    { side: "EF", bay: "12", lot: "800005", quantity: 2 },
    { side: "DE", bay: "08", lot: "800005", quantity: 15 },
    { side: "DE", bay: "20", lot: "800005", quantity: 3 },
  ];
  const duplicateIndexes = new Set([3, 5, 7, 8]);

  for (const [index, entry] of entries.entries()) {
    await page.getByRole("button", { name: entry.side, exact: true }).click();
    await page.getByRole("textbox", { name: "Vão", exact: true }).fill(entry.bay);
    await page.getByLabel("Lote", { exact: true }).fill(entry.lot);
    await page.getByLabel("Quantidade de peças", { exact: true }).fill(String(entry.quantity));
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    if (duplicateIndexes.has(index)) {
      const dialog = page.getByRole("dialog", { name: "Lote já registrado" });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await dialog.getByRole("button", { name: "Adicionar mesmo assim", exact: true }).click();
    }
  }

  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByText("Sincronização concluída.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Atualizar análise", exact: true }).click();
  await expect(page.getByText("1 PEÇA FORA DO LOCAL PRINCIPAL", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("5 PEÇAS FORA DO LOCAL PRINCIPAL", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("LOTE DISTRIBUÍDO EM MAIS DE UM LOCAL", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalizar inventário", exact: true }).click();
  await page.getByRole("dialog", { name: "Finalizar inventário?" }).getByRole("button", { name: "Finalizar inventário", exact: true }).click();
  await expect(page.getByText("Inventário finalizado. O relatório e as exportações estão preservados.", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/historico");
  await expect(page.locator(".history-row").first()).toBeVisible({ timeout: 30_000 });
  const reportPath = await page.locator(".history-row").first().getAttribute("href");
  expect(reportPath).toBeTruthy();

  for (const width of [360, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(reportPath!);
    await expect(page.getByText("Lotes consolidados", { exact: true })).toBeVisible({ timeout: 30_000 });

    const pieceLot = page.locator(".report-table tbody tr").filter({ hasText: "800003" });
    await expect(pieceLot.locator(".lot-location").nth(0)).toHaveAttribute("aria-label", "EF 15 · 19 pç");
    await expect(pieceLot.locator(".lot-location").nth(1)).toHaveAttribute("aria-label", "DE 21 · 1 pç");

    const okLot = page.locator(".report-table tbody tr").filter({ hasText: "800001" });
    await expect(okLot.locator(".lot-location")).toHaveAttribute("aria-label", "DE 15");
    await expect(okLot.locator(".lot-location")).not.toContainText("pç");
    await expect(okLot.locator(".lot-location")).not.toContainText("20");

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow, `overflow horizontal em ${width}px`).toBe(false);
  }
});
