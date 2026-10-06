import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test("lança localmente e recarrega offline depois de o shell ser armazenado", async ({ page, context }) => {
  const { ownerEmail } = seedUsers("offline");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await page.getByRole("button", { name: "LE" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Camada").selectOption("A1");
  await page.getByLabel("Lote").fill("2712345678");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator('[aria-label="Resumo do inventário"] .metric-card--records .metric-value')).toHaveText("1");
  await page.getByRole("link", { name: "Abrir lista completa de lançamentos" }).click();
  await expect(page.getByText("Lote 2712345678")).toBeVisible();
  await page.getByRole("link", { name: /Voltar ao inventário/ }).click();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // A primeira navegação controlada popula o cache de rota do shell Serwist.
  await page.reload();
  await expect(page.locator('[aria-label="Resumo do inventário"] .metric-card--records .metric-value')).toHaveText("1");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[aria-label="Resumo do inventário"] .metric-card--records .metric-value')).toHaveText("1");
});
