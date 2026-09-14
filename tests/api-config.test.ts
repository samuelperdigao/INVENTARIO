import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("usa o proxy local quando nenhuma URL pública foi configurada", async () => {
  vi.stubEnv("NEXT_PUBLIC_ANALYSIS_API_BASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SYNC_API_BASE_URL", "");

  const config = await import("@/lib/api-config");

  expect(config.analysisApiBaseUrl).toBe("/backend-api");
  expect(config.apiBaseUrl).toBe("/backend-api");
});

it("preserva URLs distintas para análise e sincronização", async () => {
  vi.stubEnv("NEXT_PUBLIC_ANALYSIS_API_BASE_URL", "https://analysis.example.com");
  vi.stubEnv("NEXT_PUBLIC_SYNC_API_BASE_URL", "https://sync.example.com");

  const config = await import("@/lib/api-config");

  expect(config.analysisApiBaseUrl).toBe("https://analysis.example.com");
  expect(config.apiBaseUrl).toBe("https://sync.example.com");
});

it("compartilha a única URL pública configurada entre os clientes", async () => {
  vi.stubEnv("NEXT_PUBLIC_ANALYSIS_API_BASE_URL", "https://api.example.com");
  vi.stubEnv("NEXT_PUBLIC_SYNC_API_BASE_URL", "");

  const config = await import("@/lib/api-config");

  expect(config.analysisApiBaseUrl).toBe("https://api.example.com");
  expect(config.apiBaseUrl).toBe("https://api.example.com");
});
