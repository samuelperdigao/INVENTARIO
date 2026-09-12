import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test("lança localmente e recarrega offline depois de o shell ser armazenado", async ({ page, context }) => {
  const { ownerEmail } = seedUsers("offline");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await page.getByRole("button", { name: "EF" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Lote").fill("000123");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Lote 000123")).toBeVisible();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // A primeira navegação controlada popula o cache de rota do shell Serwist.
  await page.reload();
  await expect(page.getByText("Lote 000123")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Lote 000123")).toBeVisible();
});
