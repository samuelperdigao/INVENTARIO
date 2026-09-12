import { afterEach, expect, it, vi } from "vitest";

import { shareReport } from "@/lib/report-client";

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
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:report"), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  await expect(shareReport("inventory-id", "docx")).resolves.toBe("downloaded");
  expect(click).toHaveBeenCalledOnce();
});
