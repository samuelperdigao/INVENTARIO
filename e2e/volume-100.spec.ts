import { expect, test } from "@playwright/test";

import { login, seedUsers } from "./helpers";

test("processa 100 lançamentos, finaliza e baixa os quatro formatos", async ({ page }) => {
  test.setTimeout(240_000);
  const { ownerEmail } = seedUsers("volume-export");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: /^Iniciar novo inventário/ }).click();
  await expect(page.getByRole("heading", { name: "Novo registro" })).toBeVisible();

  const entries: Array<{ side: "EF" | "DE"; bay: string; layer?: string; lot: string; quantity: number }> = [
    { side: "EF", bay: "15", layer: "A1", lot: "2710000001", quantity: 19 },
    { side: "DE", bay: "21", lot: "2710000001", quantity: 1 },
    { side: "EF", bay: "10", layer: "A2", lot: "2710000002", quantity: 10 },
    { side: "DE", bay: "10", lot: "2710000002", quantity: 10 },
    { side: "EF", bay: "11", lot: "2710000003", quantity: 11 },
    { side: "DE", bay: "11", layer: "A3", lot: "2710000003", quantity: 9 },
    { side: "DE", bay: "08", layer: "A4", lot: "2710000004", quantity: 15 },
    { side: "EF", bay: "12", lot: "2710000004", quantity: 2 },
    { side: "DE", bay: "20", layer: "A5", lot: "2710000004", quantity: 3 },
  ];
  for (let index = 0; index < 91; index += 1) {
    entries.push({
      side: index % 2 === 0 ? "EF" : "DE",
      bay: String((index % 30) + 1),
      layer: index % 3 === 0 ? undefined : `A${(index % 10) + 1}`,
      lot: `272${String(index).padStart(7, "0")}`,
      quantity: (index % 27) + 1,
    });
  }

  const expectedDuplicates = new Set([1, 3, 5, 7, 8]);
  for (const [index, item] of entries.entries()) {
    await page.getByRole("button", { name: item.side === "EF" ? "LE" : "LP", exact: true }).click();
    await page.getByRole("textbox", { name: "Vão", exact: true }).fill(item.bay);
    await page.getByLabel(/Camada/).selectOption(item.layer ?? "");
    await page.getByLabel("Lote", { exact: true }).fill(item.lot);
    await page.getByLabel("Quantidade de peças", { exact: true }).fill(String(item.quantity));
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    if (expectedDuplicates.has(index)) {
      await expect(page.getByRole("dialog", { name: "Lote já registrado" })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("dialog", { name: "Lote já registrado" }).getByRole("button", { name: "Adicionar mesmo assim", exact: true }).click();
    }
    await expect(page.locator(".entry-row")).toHaveCount(index + 1);
  }

  const metrics = page.locator('[aria-label="Resumo do inventário"] .metric-card .metric-value');
  await expect(metrics.nth(0)).toHaveText("100");
  await expect(metrics.nth(1)).toHaveText("95");
  await expect(metrics.nth(2)).toHaveText("1269");

  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByText("Sincronização concluída.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Atualizar análise", exact: true }).click();
  await expect(page.getByText("1 PEÇA FORA DO LOCAL PRINCIPAL", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("PEÇA_SOLTEIRA", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Finalizar inventário", exact: true }).click();
  const finishDialog = page.getByRole("dialog", { name: "Finalizar inventário?" });
  await finishDialog.getByRole("button", { name: "Finalizar inventário", exact: true }).click();
  await expect(page.getByText("Inventário finalizado. O relatório e as exportações estão preservados.", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/historico");
  await page.locator(".history-row").first().click();
  await expect(page.getByText("100", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Lotes consolidados", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lotes para conferência", exact: true })).toBeVisible();

  for (const extension of ["xls", "xlsx", "pdf", "docx"] as const) {
    const label = extension === "xls"
      ? "Baixar Excel compatível (.xls)"
      : extension === "xlsx"
        ? "Baixar Excel moderno (.xlsx)"
        : extension === "pdf"
          ? "Baixar PDF"
          : "Baixar Word";
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
  }
});
