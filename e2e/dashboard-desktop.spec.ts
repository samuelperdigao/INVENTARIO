import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test.use({ viewport: { width: 1920, height: 1080 } });

test("organiza o dashboard em desktop sem overflow horizontal", async ({ page }) => {
  const { ownerEmail } = seedUsers("desktop");
  await login(page, ownerEmail);

  await expect(page.getByRole("heading", { name: /Bem-vindo\(a\),/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Iniciar novo inventário/ })).toBeEnabled();

  const shellBox = await page.locator("main.dashboard-shell").boundingBox();
  expect(shellBox).not.toBeNull();
  expect(shellBox!.width).toBeGreaterThan(1400);

  const actionCards = page.locator(".action-grid .action-card");
  await expect(actionCards).toHaveCount(4);
  const actionBoxes = await Promise.all(
    Array.from({ length: 4 }, (_, index) => actionCards.nth(index).boundingBox()),
  );
  expect(actionBoxes.every((box) => box !== null)).toBe(true);
  const firstY = actionBoxes[0]!.y;
  expect(actionBoxes.every((box) => Math.abs(box!.y - firstY) < 2)).toBe(true);
  expect(actionBoxes.every((box) => box!.width > 250)).toBe(true);

  const mainColumn = await page.locator(".dashboard-grid > section").boundingBox();
  const sideColumn = await page.locator(".dashboard-grid > aside").boundingBox();
  expect(mainColumn).not.toBeNull();
  expect(sideColumn).not.toBeNull();
  expect(sideColumn!.x).toBeGreaterThan(mainColumn!.x + mainColumn!.width);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
