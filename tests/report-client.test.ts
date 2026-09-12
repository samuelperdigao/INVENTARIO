import { afterEach, expect, it, vi } from "vitest";

import { sharePdfReport } from "@/lib/report-client";

vi.mock("@/lib/auth-client", () => ({
  getAuthenticatedSession: vi.fn().mockResolvedValue({ accessToken: "access-token", user: { email: "teste@gerdau.com.br" } }),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pdfResponse(): Response {
  return new Response(new Uint8Array([37, 80, 68, 70]), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Inventario_12-09-2026.pdf"' },
  });
}

it("usa compartilhamento nativo com PDF quando o dispositivo aceita arquivos", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse()));
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, canShare: vi.fn().mockReturnValue(true) });

  await expect(sharePdfReport("inventory-id")).resolves.toBe("shared");
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ name: "Inventario_12-09-2026.pdf" })] }));
});

it("baixa o PDF quando a Web Share API não suporta arquivos", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse()));
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:report"), revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  await expect(sharePdfReport("inventory-id")).resolves.toBe("downloaded");
  expect(click).toHaveBeenCalledOnce();
});
