import { afterEach, expect, it, vi } from "vitest";

import { reportErrorMessage, shareReport } from "@/lib/report-client";

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

function prepareDownloadFallback() {
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:report"), revokeObjectURL: vi.fn() });
  return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}

it("usa compartilhamento nativo com PDF quando o dispositivo aceita arquivos", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reportResponse("Inventario_12-09-2026.pdf", "application/pdf")));
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  await expect(shareReport("inventory-id", "pdf")).resolves.toBe("shared");
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ name: "Inventario_12-09-2026.pdf" })] }));
});

it("compartilha Excel quando o dispositivo aceita o formato", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reportResponse("Inventario_12-09-2026.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")));
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  await expect(shareReport("inventory-id", "xlsx")).resolves.toBe("shared");
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ name: "Inventario_12-09-2026.xlsx" })] }));
});

it("baixa o arquivo quando a Web Share API não suporta compartilhamento", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reportResponse("Inventario_12-09-2026.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")));
  vi.stubGlobal("navigator", {});
  const click = prepareDownloadFallback();

  await expect(shareReport("inventory-id", "docx")).resolves.toBe("downloaded");
  expect(click).toHaveBeenCalledOnce();
});

it("faz fallback para download quando o navegador responde Permission denied", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reportResponse("Inventario_12-09-2026.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")));
  const share = vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });
  const click = prepareDownloadFallback();

  await expect(shareReport("inventory-id", "xlsx")).resolves.toBe("downloaded");
  expect(click).toHaveBeenCalledOnce();
});

it("trata cancelamento sem baixar o arquivo", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reportResponse("Inventario_12-09-2026.pdf", "application/pdf")));
  const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  await expect(shareReport("inventory-id", "pdf")).resolves.toBe("cancelled");
});

it("traduz erros comuns do navegador para português", () => {
  expect(reportErrorMessage(new Error("Permission denied"))).toBe("O navegador não permitiu compartilhar este arquivo.");
  expect(reportErrorMessage(new TypeError("Failed to fetch"))).toBe("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
});
