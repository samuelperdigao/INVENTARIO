import { expect, test } from "@playwright/test";

import { login, seedUsers } from "./helpers";

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test("mantém a tela operacional legível nas resoluções de campo", async ({ page }) => {
  const { ownerEmail } = seedUsers("visual-operational");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: /Iniciar novo inventário/ }).click();
  await expect(page.getByRole("heading", { name: "Novo registro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar planilha SAP", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar sem planilha SAP", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Controle do inventário", exact: true })).toBeVisible();
  await expect(page.locator(".inventory-rail-label")).toHaveText(/Inventário ativo/);
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Sincronização" })).toBeVisible();
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Análise" })).toBeVisible();
  await expect(page.locator(".control-stage-summary").filter({ hasText: "Finalização" })).toBeVisible();
  await expect(page.getByText(/FastAPI|ID técnico|token/i)).toHaveCount(0);

  const referencePanel = page.locator(".reference-panel");
  const entryWorkspace = page.locator(".entry-workspace");
  expect(await referencePanel.evaluate((node, target) => Boolean(node.compareDocumentPosition(target as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await entryWorkspace.elementHandle())).toBe(true);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".inventory-rail");
      const workflow = document.querySelector<HTMLElement>(".workflow-strip");
      const workspace = document.querySelector<HTMLElement>(".entry-workspace");
      const currentStep = document.querySelector<HTMLElement>(".inventory-current-step");
      const submit = document.querySelector<HTMLElement>(".entry-form-submit");
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workflowDisplay: workflow ? getComputedStyle(workflow).display : "removed",
        railPosition: rail ? getComputedStyle(rail).position : "missing",
        workspaceColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : "missing",
        currentStepVisible: currentStep ? getComputedStyle(currentStep).display !== "none" : false,
        submitHeight: submit?.getBoundingClientRect().height ?? 0,
        controlStages: document.querySelectorAll(".control-stage-details").length,
      };
    });

    expect(layout.scrollWidth, `overflow horizontal em ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.workflowDisplay).toBe("removed");
    expect(layout.controlStages).toBe(3);

    if (viewport.width >= 1180) {
      expect(layout.railPosition).toBe("sticky");
      expect(layout.workspaceColumns.split(" ")).toHaveLength(2);
      expect(layout.currentStepVisible).toBe(false);
    } else if (viewport.width >= 640) {
      expect(layout.railPosition).toBe("sticky");
      expect(layout.workspaceColumns.split(" ")).toHaveLength(viewport.width >= 901 ? 2 : 1);
    } else {
      expect(layout.currentStepVisible).toBe(true);
      expect(layout.workspaceColumns.split(" ")).toHaveLength(1);
      expect(layout.submitHeight).toBeGreaterThanOrEqual(48);
    }
  }
});

test("mostra a tela segura quando o inventário não está no dispositivo", async ({ page }) => {
  await page.goto("/inventarios/00000000-0000-7000-8000-000000000000");

  await expect(page.getByRole("heading", { name: "Não encontramos este inventário", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao painel", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("link", { name: "Participar com código", exact: true })).toHaveAttribute("href", "/dashboard#participar");
  await expect(page.getByText(/não foi localizado neste dispositivo/i)).toBeVisible();
});
