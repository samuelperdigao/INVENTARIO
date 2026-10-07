import { expect, test } from "@playwright/test";
import { login, seedUsers } from "./helpers";

test.use({ serviceWorkers: "block" });

test("falha ao consultar atribuídos preserva o dashboard local e permite tentar novamente", async ({ page }) => {
  const { ownerEmail } = seedUsers("assigned-dashboard");
  await login(page, ownerEmail);
  await page.getByRole("button", { name: "Iniciar novo inventário" }).click();
  await expect(page.getByRole("heading", { name: "Novo registro", exact: true })).toBeVisible();

  let assignedRequests = 0;
  await page.route("**/backend-api/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/api/v1/inventories/assigned")) {
      assignedRequests += 1;
      if (assignedRequests === 1) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Serviço indisponível" }) });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return;
    }
    await route.continue();
  });

  await page.goto("/dashboard");
  const localSection = page.getByRole("region", { name: "Inventários locais abertos" });
  await expect(page.getByText("Não foi possível consultar os inventários disponíveis na conta.")).toBeVisible();
  await expect(localSection.locator("a.inventory-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Nenhum inventário recebido precisa ser baixado neste dispositivo.")).toBeVisible();
  await expect(page.getByText("Não foi possível consultar os inventários disponíveis na conta.")).toHaveCount(0);
  await expect(localSection.locator("a.inventory-card")).toHaveCount(1);
  expect(assignedRequests).toBe(2);
});
