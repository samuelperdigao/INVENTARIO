import { expect, test } from "@playwright/test";

import { login, seedUsers } from "./helpers";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

function assertWcagAaContrast(value: number, label: string): void {
  expect(value, `${label} precisa atingir contraste WCAG AA`).toBeGreaterThanOrEqual(4.5);
}

test("mantém ações e estados do painel com contraste e área de toque adequados", async ({ page }) => {
  const { ownerEmail } = seedUsers("dashboard-contrast");
  await login(page, ownerEmail);
  await page.setViewportSize({ width: 390, height: 844 });

  const measurements = await page.evaluate(() => {
    function parseColor(value: string): [number, number, number] {
      const match = value.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/);
      if (!match) throw new Error(`Cor não analisável: ${value}`);
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function luminance(value: string): number {
      return parseColor(value).map((channel) => channel / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    }

    function contrast(foreground: string, background: string): number {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + .05) / (dark + .05);
    }

    const primary = document.querySelector<HTMLElement>(".action-card.primary-action");
    const primaryText = primary?.querySelector<HTMLElement>("strong");
    const secondary = document.querySelector<HTMLElement>(".action-card:not(.primary-action)");
    const secondaryText = secondary?.querySelector<HTMLElement>("strong");
    if (!primary || !primaryText || !secondary || !secondaryText) throw new Error("Ações rápidas não encontradas");
    return {
      primaryContrast: contrast(getComputedStyle(primaryText).color, getComputedStyle(primary).backgroundColor),
      secondaryContrast: contrast(getComputedStyle(secondaryText).color, getComputedStyle(secondary).backgroundColor),
      primaryHeight: primary.getBoundingClientRect().height,
      secondaryHeight: secondary.getBoundingClientRect().height,
    };
  });

  assertWcagAaContrast(measurements.primaryContrast, "ação principal");
  assertWcagAaContrast(measurements.secondaryContrast, "ação secundária");
  expect(measurements.primaryHeight).toBeGreaterThanOrEqual(44);
  expect(measurements.secondaryHeight).toBeGreaterThanOrEqual(44);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".app-rail");
      const shell = document.querySelector<HTMLElement>("main.dashboard-shell");
      const railRect = rail?.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        railPosition: rail ? getComputedStyle(rail).position : "missing",
        shellPaddingBottom: shell ? Number.parseFloat(getComputedStyle(shell).paddingBottom) : 0,
        railHeight: railRect?.height ?? 0,
      };
    });
    expect(layout.scrollWidth, `overflow horizontal em ${viewport.width}px`).toBeLessThanOrEqual(layout.viewportWidth + 1);
    if (viewport.width < 1200) {
      expect(layout.railPosition).toBe("fixed");
      expect(layout.shellPaddingBottom).toBeGreaterThanOrEqual(layout.railHeight - 1);
    }
  }
});

test("mantém a tela operacional legível nas resoluções de campo", async ({ page }) => {
  const { ownerEmail } = seedUsers("visual-operational");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: /Iniciar novo inventário/ }).click();
  await page.getByRole("button", { name: "Importar planilha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo registro" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir lista completa de lançamentos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Referência SAP / SICLA", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar planilha SAP / SICLA", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar sem planilha SAP / SICLA", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Controle do inventário", exact: true })).toBeVisible();
  await expect(page.locator(".inventory-process")).toHaveAttribute("aria-label", /Etapa atual: Lançar/);
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Sincronização" })).toBeVisible();
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Análise" })).toBeVisible();
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Finalização" })).toBeVisible();
  await expect(page.getByText(/FastAPI|ID técnico|token/i)).toHaveCount(0);
  await expect(page.locator(".control-stage-details[open]")).toHaveCount(1);
  await page.locator(".control-stage-summary").filter({ hasText: "Análise" }).click();
  await expect(page.locator(".control-stage-details[open]")).toHaveCount(1);
  await expect(page.locator(".control-stage-details[open] .control-stage-summary")).toContainText("Análise");

  const referencePanel = page.locator(".reference-panel");
  const entryWorkspace = page.locator(".entry-workspace");
  expect(await referencePanel.evaluate((node, target) => Boolean(node.compareDocumentPosition(target as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await entryWorkspace.elementHandle())).toBe(true);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".app-rail");
      const workflow = document.querySelector<HTMLElement>(".workflow-strip");
      const workspace = document.querySelector<HTMLElement>(".entry-workspace");
      const currentStep = document.querySelector<HTMLElement>(".inventory-process li.active");
      const quantity = document.querySelector<HTMLElement>("#quantity");
      const submit = document.querySelector<HTMLElement>(".entry-form-submit");
      const quantityRect = quantity?.getBoundingClientRect();
      const submitRect = submit?.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workflowDisplay: workflow ? getComputedStyle(workflow).display : "removed",
      railPosition: rail ? getComputedStyle(rail).position : "missing",
        workspaceColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : "missing",
        currentStepVisible: currentStep ? getComputedStyle(currentStep).display !== "none" : false,
        submitHeight: submit?.getBoundingClientRect().height ?? 0,
        submitPosition: submit ? getComputedStyle(submit).position : "missing",
        quantityBottom: quantityRect?.bottom ?? 0,
        submitTop: submitRect?.top ?? 0,
        controlStages: document.querySelectorAll(".control-stage-details").length,
      };
    });

    expect(layout.scrollWidth, `overflow horizontal em ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.workflowDisplay).toBe("removed");
    expect(layout.controlStages).toBe(3);
    expect(layout.submitTop).toBeGreaterThanOrEqual(layout.quantityBottom);

    if (viewport.width >= 1180) {
      expect(layout.railPosition).toBe("fixed");
      expect(layout.workspaceColumns.split(" ")).toHaveLength(2);
      expect(layout.currentStepVisible).toBe(true);
    } else if (viewport.width >= 640) {
      expect(layout.railPosition).toBe("fixed");
      expect(layout.workspaceColumns.split(" ")).toHaveLength(viewport.width >= 901 ? 2 : 1);
    } else {
      expect(layout.currentStepVisible).toBe(true);
      expect(layout.workspaceColumns.split(" ")).toHaveLength(1);
      expect(layout.submitHeight).toBeGreaterThanOrEqual(48);
      expect(layout.submitPosition).toBe("static");
    }
  }
});

test("mantém o botão de lançamento no fluxo quando o viewport mobile é reduzido", async ({ page }) => {
  const { ownerEmail } = seedUsers("mobile-entry-form");
  await login(page, ownerEmail);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Iniciar novo inventário/ }).click();
  await page.getByRole("button", { name: "Continuar sem planilha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo registro" })).toBeVisible();

  const quantity = page.getByLabel("Quantidade de peças");
  const submit = page.locator(".entry-form-submit");
  const measure = () => page.evaluate(() => {
    const quantityElement = document.querySelector<HTMLElement>("#quantity");
    const submitElement = document.querySelector<HTMLElement>(".entry-form-submit");
    if (!quantityElement || !submitElement) throw new Error("Campos do formulário não encontrados.");
    const quantityRect = quantityElement.getBoundingClientRect();
    const submitRect = submitElement.getBoundingClientRect();
    return {
      quantityBottom: quantityRect.bottom,
      submitTop: submitRect.top,
      submitPosition: getComputedStyle(submitElement).position,
    };
  });

  await quantity.scrollIntoViewIfNeeded();
  const closedKeyboard = await measure();
  expect(closedKeyboard.submitPosition).toBe("static");
  expect(closedKeyboard.submitTop).toBeGreaterThanOrEqual(closedKeyboard.quantityBottom);

  await page.setViewportSize({ width: 390, height: 520 });
  await quantity.scrollIntoViewIfNeeded();
  const openKeyboard = await measure();
  expect(openKeyboard.submitPosition).toBe("static");
  expect(openKeyboard.submitTop).toBeGreaterThanOrEqual(openKeyboard.quantityBottom);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const afterScroll = await measure();
  expect(afterScroll.submitPosition).toBe("static");
  expect(afterScroll.submitTop).toBeGreaterThanOrEqual(afterScroll.quantityBottom);
  await expect(submit).toBeVisible();
});

test("mantém todas as ações do diálogo de finalização dentro do viewport mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const { ownerEmail } = seedUsers("mobile-finalization-dialog");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: /Iniciar novo inventário/ }).click();
  await page.getByRole("button", { name: "Continuar sem planilha", exact: true }).click();

  const trigger = page.getByRole("button", { name: "Finalizar inventário", exact: true });
  await page.locator(".control-stage-summary").filter({ hasText: "Finalização" }).click();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Finalizar inventário?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Finalizar inventário", exact: true })).toBeVisible();

  const layout = await dialog.evaluate((node) => {
    const dialogRect = node.getBoundingClientRect();
    const buttons = [...node.querySelectorAll<HTMLButtonElement>("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });

    return {
      viewportHeight: window.innerHeight,
      portalMountedOnBody: node.parentElement?.parentElement === document.body,
      dialogTop: dialogRect.top,
      dialogBottom: dialogRect.bottom,
      buttons,
    };
  });

  expect(layout.portalMountedOnBody).toBe(true);
  expect(layout.dialogTop).toBeGreaterThanOrEqual(0);
  expect(layout.dialogBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.buttons).toHaveLength(2);
  for (const button of layout.buttons) {
    expect(button.top).toBeGreaterThanOrEqual(0);
    expect(button.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  }
});

test("mostra a tela segura quando o inventário não está no dispositivo", async ({ page }) => {
  await page.goto("/inventarios/00000000-0000-7000-8000-000000000000");

  await expect(page.getByRole("heading", { name: "Não encontramos este inventário", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao painel", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("link", { name: "Participar com código", exact: true })).toHaveAttribute("href", "/dashboard#participar");
  await expect(page.getByText(/não foi localizado neste dispositivo/i)).toBeVisible();
});
