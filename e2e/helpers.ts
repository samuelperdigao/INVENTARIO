import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";

const pythonExecutable = process.platform === "win32" ? "backend\\.venv\\Scripts\\python.exe" : "backend/.venv/bin/python";

export function seedUsers(prefix: string): { ownerEmail: string; participantEmail: string } {
  const runId = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `${runId}@gerdau.com.br`;
  const participantEmail = `participante-${runId}@gerdau.com.br`;
  execFileSync(pythonExecutable, ["backend/tests/e2e_seed.py", ownerEmail, participantEmail], {
    env: { ...process.env, INVENTORY_DATABASE_URL: "sqlite:///./backend/inventario-e2e.db" },
  });
  return { ownerEmail, participantEmail };
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/acesso");
  await page.getByLabel("E-mail corporativo").fill(email);
  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
