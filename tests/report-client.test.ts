import { afterEach, expect, it, vi } from "vitest";

import {
  fetchReportFile,
  prepareResourcesForSharing,
  reportErrorMessage,
  sharePreparedResource,
} from "@/lib/report-client";

vi.mock("@/lib/auth-client", () => ({
  getAuthenticatedSession: vi.fn().mockResolvedValue({ accessToken: "access-token", user: { email: "teste@example.com" } }),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function reportResponse(filename: string, contentType: string): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

function shareLinkResponse(path: string): Response {
  return new Response(JSON.stringify({ path }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

it("prepara PDF como arquivo e Excel/Word como links", async () => {
  vi.stubGlobal("window", { location: { origin: "https://inventario-lpe.vercel.app" } });
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(reportResponse("Inventario.pdf", "application/pdf"))
    .mockResolvedValueOnce(shareLinkResponse("/api/v1/shared/exports/inventory-id/xlsx?expires=1&signature=a"))
    .mockResolvedValueOnce(shareLinkResponse("/api/v1/shared/exports/inventory-id/docx?expires=1&signature=b")));

  const resources = await prepareResourcesForSharing("inventory-id");

  expect(resources.pdf?.name).toBe("Inventario.pdf");
  expect(resources.xlsx).toContain("/backend-api/api/v1/shared/exports/inventory-id/xlsx");
  expect(resources.docx).toContain("/backend-api/api/v1/shared/exports/inventory-id/docx");
});

it("baixa XLS pelo endpoint legado como Blob, preservando nome, tipo e conteúdo", async () => {
  const fetchMock = vi.fn().mockResolvedValue(reportResponse("Inventario_2026-09-12.xls", "application/vnd.ms-excel"));
  vi.stubGlobal("fetch", fetchMock);

  const file = await fetchReportFile("inventory-id", "xls");

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/inventories/inventory-id/export/excel?format=xls"),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token" }) }),
  );
  expect(file.name).toBe("Inventario_2026-09-12.xls");
  expect(file.type).toBe("application/vnd.ms-excel");
  expect(file.size).toBeGreaterThan(0);
});

it("compartilha PDF como arquivo nativo", async () => {
  const file = new File([new Uint8Array([1])], "Inventario.pdf", { type: "application/pdf" });
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  const resultPromise = sharePreparedResource(file, "pdf");
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }));
  await expect(resultPromise).resolves.toBe("shared");
});

it("compartilha Excel como link pelo menu nativo", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share });
  const url = "https://inventario-lpe.vercel.app/backend-api/api/v1/shared/exports/id/xlsx?expires=1&signature=x";

  const resultPromise = sharePreparedResource(url, "xlsx");
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ url }));
  await expect(resultPromise).resolves.toBe("shared");
});

it("trata cancelamento do compartilhamento", async () => {
  const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
  vi.stubGlobal("navigator", { share });

  await expect(sharePreparedResource("https://example.com/file", "docx")).resolves.toBe("cancelled");
});

it("traduz falhas técnicas para português", () => {
  expect(reportErrorMessage(new DOMException("Permission denied", "NotAllowedError"))).toContain("O navegador bloqueou o compartilhamento nativo");
  expect(reportErrorMessage(new TypeError("Failed to fetch"))).toBe("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
});
