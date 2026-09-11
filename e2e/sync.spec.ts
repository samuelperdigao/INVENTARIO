import { expect, test } from "@playwright/test";

test("sincroniza um inventário entre dois contextos sem interromper o lançamento local", async ({ browser, page }) => {
  const email = `operador-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Seu nome").fill("Operador");
  await page.getByLabel("Nome da equipe").fill("Equipe de teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByText("Conta conectada")).toBeVisible();
  await page.getByRole("button", { name: "Iniciar inventário" }).click();
  await page.getByRole("button", { name: "EF" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Lote").fill("000123");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(page.getByRole("status")).toHaveText("Sincronização concluída.");
  await page.getByText("Conectar este inventário em outro dispositivo").click();
  const inventoryId = await page.locator("code").nth(0).textContent();
  const syncToken = await page.locator("code").nth(1).textContent();
  expect(inventoryId).toBeTruthy();
  expect(syncToken).toBeTruthy();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/");
  await secondPage.getByLabel("E-mail").fill(email);
  await secondPage.getByLabel("Senha").fill("senha-segura-123");
  await secondPage.getByRole("button", { name: "Entrar" }).click();
  await expect(secondPage.getByText("Conta conectada")).toBeVisible();
  await secondPage.getByLabel("ID do inventário").fill(inventoryId!);
  await secondPage.getByLabel("Código de sincronização").fill(syncToken!);
  await secondPage.getByRole("button", { name: "Conectar inventário" }).click();
  await expect(secondPage.getByText("Lote 000123")).toBeVisible();
  await secondContext.close();
});
