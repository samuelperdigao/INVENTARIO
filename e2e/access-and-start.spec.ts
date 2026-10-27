import { expect, test } from "@playwright/test";

import { login, seedUsers } from "./helpers";

test("ambientação industrial do acesso preserva a leitura em resoluções estreitas", async ({ page }) => {
  await page.goto("/acesso");
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await expect(page.locator(".auth-aside")).toHaveCSS("background-image", /industrial-yard-hero\.jpg/);

  for (const width of [390, 430, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".auth-card");
      const aside = document.querySelector<HTMLElement>(".auth-aside");
      if (!card || !aside) throw new Error("Painéis do acesso não encontrados.");
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        cardLeft: card.getBoundingClientRect().left,
        cardRight: card.getBoundingClientRect().right,
        asideHeight: aside.getBoundingClientRect().height,
      };
    });
    expect(bounds.scrollWidth, `overflow em ${width}px`).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(bounds.cardLeft).toBeGreaterThanOrEqual(0);
    expect(bounds.cardRight).toBeLessThanOrEqual(width + 1);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  }
});

test("Voltar fecha a escolha SAP / SICLA sem criar inventário", async ({ page }) => {
  const { ownerEmail } = seedUsers("start-choice-back");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: /Iniciar novo inventário/ }).click();
  const dialog = page.getByRole("dialog", { name: "Você quer importar a planilha SAP / SICLA?" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".inventory-link")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Nenhum inventário em andamento")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar novo inventário" })).toBeVisible();
});
