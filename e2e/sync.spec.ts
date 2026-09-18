import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test("participa de um inventário com seis dígitos sem expor UUID ou token", async ({ browser, page }) => {
  const { ownerEmail, participantEmail } = seedUsers("sync");
  await login(page, ownerEmail);
  await expect(page.getByText(/Bem-vindo\(a\)/)).toBeVisible();
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await page.getByRole("button", { name: "EF" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Camada").selectOption("A1");
  await page.getByLabel("Lote").fill("2712345678");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(page.getByText("Sincronização concluída.", { exact: true })).toBeVisible();
  const participationCode = (await page.locator(".participation-code").textContent())?.trim();
  expect(participationCode).toMatch(/^\d{6}$/);
  await expect(page.getByText("ID:")).toHaveCount(0);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await login(secondPage, participantEmail);
  await expect(secondPage.getByText(/Bem-vindo\(a\)/)).toBeVisible();
  await secondPage.getByLabel("Código de participação").fill(participationCode!);
  await secondPage.getByRole("button", { name: "Participar agora" }).click();
  await expect(secondPage.getByText("Lote 2712345678")).toBeVisible();
  await secondContext.close();
});
