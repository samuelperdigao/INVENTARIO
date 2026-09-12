import { afterEach, expect, it, vi } from "vitest";

import {
  prepareReportsForSharing,
  reportErrorMessage,
  sharePreparedReport,
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

it("prepara os arquivos antes do clique de compartilhamento", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(reportResponse("Inventario.pdf", "application/pdf"))
    .mockResolvedValueOnce(reportResponse("Inventario.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    .mockResolvedValueOnce(reportResponse("Inventario.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")));

  const files = await prepareReportsForSharing("inventory-id");

  expect(files.pdf?.name).toBe("Inventario.pdf");
  expect(files.xlsx?.name).toBe("Inventario.xlsx");
  expect(files.docx?.name).toBe("Inventario.docx");
});

it("chama o compartilhamento nativo imediatamente para Excel já preparado", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "Inventario.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  const resultPromise = sharePreparedReport(file, "xlsx");
  expect(share).toHaveBeenCalledOnce();
  await expect(resultPromise).resolves.toBe("shared");
});

it("informa indisponibilidade sem baixar quando o navegador não suporta arquivo", async () => {
  const file = new File([new Uint8Array([1])], "Inventario.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  vi.stubGlobal("navigator", { share: vi.fn(), canShare: vi.fn().mockReturnValue(false) });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  await expect(sharePreparedReport(file, "docx")).resolves.toBe("unsupported");
  expect(click).not.toHaveBeenCalled();
});

it("trata cancelamento sem baixar o arquivo", async () => {
  const file = new File([new Uint8Array([1])], "Inventario.pdf", { type: "application/pdf" });
  const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  await expect(sharePreparedReport(file, "pdf")).resolves.toBe("cancelled");
  expect(click).not.toHaveBeenCalled();
});

it("traduz bloqueio de permissão do navegador para português", async () => {
  const file = new File([new Uint8Array([1])], "Inventario.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const share = vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  await expect(sharePreparedReport(file, "xlsx")).rejects.toThrow("O navegador bloqueou o compartilhamento nativo");
  expect(reportErrorMessage(new TypeError("Failed to fetch"))).toBe("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
});
