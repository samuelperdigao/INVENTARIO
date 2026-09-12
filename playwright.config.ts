import { defineConfig, devices } from "@playwright/test";

const pythonExecutable = process.platform === "win32" ? "backend\\.venv\\Scripts\\python.exe" : "backend/.venv/bin/python";
const e2eDatabaseUrl = "sqlite:///./backend/inventario-e2e.db";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next start -H 127.0.0.1",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${pythonExecutable} -m alembic -c backend/alembic.ini upgrade head && ${pythonExecutable} -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/healthz",
      reuseExistingServer: !process.env.CI,
      env: { INVENTORY_DATABASE_URL: e2eDatabaseUrl },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
