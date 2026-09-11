import { expect, test } from "@playwright/test";

test("envia lançamentos ao motor online e identifica o cache quando fica offline", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Iniciar inventário" }).click();

  await page.getByRole("button", { name: "DE" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Lote").fill("000123");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await page.getByRole("button", { name: "EF" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("21");
  await page.getByLabel("Lote").fill("000123");
  await page.getByLabel("Quantidade de peças").fill("1");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await page.getByRole("button", { name: "Atualizar análise" }).click();
  await expect(page.getByText("PEÇA_SOLTEIRA")).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Atualizar análise" }).click();
  await expect(page.getByText(/Resultado em cache, possivelmente desatualizado/)).toBeVisible();
});
