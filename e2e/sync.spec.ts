import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test("participa de um inventário com seis dígitos sem expor UUID ou token", async ({ browser, page }) => {
  test.setTimeout(90_000);
  const { ownerEmail, participantEmail } = seedUsers("sync");
  await login(page, ownerEmail);
  await expect(page.getByText(/Bem-vindo\(a\)/)).toBeVisible();
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await page.getByRole("button", { name: "LE" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("15");
  await page.getByLabel("Camada").selectOption("A1");
  await page.getByLabel("Lote").fill("2712345678");
  await page.getByLabel("Quantidade de peças").fill("19");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator(".participation-code")).toHaveText(/^\d{6}$/, { timeout: 30_000 });
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

  await page.getByRole("button", { name: "LE" }).click();
  await page.getByRole("textbox", { name: "Vão" }).fill("17");
  await page.getByLabel("Camada").selectOption("A2");
  await page.getByLabel("Lote").fill("2712345689");
  await page.getByLabel("Quantidade de peças").fill("7");

  await secondPage.getByRole("button", { name: "LP" }).click();
  await secondPage.getByRole("textbox", { name: "Vão" }).fill("16");
  await secondPage.getByLabel("Lote").fill("2712345679");
  await secondPage.getByLabel("Quantidade de peças").fill("4");
  await secondPage.getByRole("button", { name: "Adicionar" }).click();
  await expect(secondPage.getByText("Lote 2712345679")).toBeVisible();

  await expect(page.getByText("Lote 2712345679")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Vão" })).toHaveValue("17");
  await expect(page.getByRole("combobox", { name: "Camada" })).toHaveValue("A2");
  await expect(page.getByRole("textbox", { name: "Lote" })).toHaveValue("2712345689");
  await expect(page.getByRole("textbox", { name: "Quantidade de peças" })).toHaveValue("7");
  await secondContext.close();
});
