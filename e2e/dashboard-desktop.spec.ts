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
  await expect(page.locator(".quick-actions")).toBeHidden();
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

    if (viewport.width >= 1200) {
      await expect(page.locator(".quick-actions")).toBeHidden();
      await expect(page.getByRole("button", { name: /Iniciar novo inventário/ })).toBeVisible();
    } else {
      await expect(page.locator(".quick-actions")).toBeVisible();
      await expect(page.locator(".action-grid .primary-action")).toBeVisible();
    }
  }
});
