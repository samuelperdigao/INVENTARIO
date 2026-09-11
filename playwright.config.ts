import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "backend\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir backend --port 8000",
      url: "http://127.0.0.1:8000/healthz",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
