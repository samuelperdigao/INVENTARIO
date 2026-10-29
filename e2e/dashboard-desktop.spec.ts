import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test.use({ viewport: { width: 1920, height: 1080 } });

test("prioriza a operação no desktop e mantém o fluxo utilizável em todos os breakpoints", async ({ page }) => {
  const { ownerEmail } = seedUsers("desktop");
  await login(page, ownerEmail);

  await expect(page.getByRole("heading", { name: /Bem-vindo\(a\),/ })).toBeVisible();
  const primaryAction = page.getByRole("button", { name: /Iniciar novo inventário/ });
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toBeEnabled();
  await expect(page.locator(".quick-actions"), "atalhos duplicados foram removidos no redesenho").toHaveCount(0);
  await expect(page.getByText("Quando você criar ou abrir uma conferência, ela aparecerá aqui.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar inventário" })).toBeVisible();

  const shellBox = await page.locator("main.dashboard-shell").boundingBox();
  expect(shellBox).not.toBeNull();
  expect(shellBox!.width).toBeGreaterThan(1400);

  const mainColumn = await page.locator(".dashboard-grid > section").boundingBox();
  const sideColumn = await page.locator(".dashboard-grid > aside").boundingBox();
  expect(mainColumn).not.toBeNull();
  expect(sideColumn).not.toBeNull();
  expect(sideColumn!.x).toBeGreaterThan(mainColumn!.x + mainColumn!.width);

  const viewports = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 576 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `overflow at ${viewport.width} × ${viewport.height}`).toBe(false);

    // O topo navy mantém as duas ações principais visíveis em qualquer largura.
    await expect(page.getByRole("button", { name: /Iniciar novo inventário/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar com código" })).toBeVisible();
  }
});

test("menu lateral acompanha a rolagem no desktop", async ({ page }) => {
  const { ownerEmail } = seedUsers("rail-sticky");
  await login(page, ownerEmail);
  await page.setViewportSize({ width: 1366, height: 520 });
  const rail = page.getByRole("complementary", { name: "Navegação do sistema" });
  await expect(rail).toBeVisible();
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(scrollable, "a página precisa rolar para o teste fazer sentido").toBeGreaterThan(200);
  const before = await rail.boundingBox();
  await page.mouse.wheel(0, 250);
  await page.waitForFunction(() => window.scrollY > 150);
  const after = await rail.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), "o menu não pode subir junto com a página").toBeLessThan(2);
});
