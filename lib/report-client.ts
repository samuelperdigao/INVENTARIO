"use client";

import { getAuthenticatedSession } from "@/lib/auth-client";

export type ReportFormat = "pdf" | "xlsx" | "docx";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

const mediaTypes: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function filenameFrom(response: Response, format: ReportFormat): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `Inventario.${format}`;
}

export async function fetchReportFile(inventoryId: string, format: ReportFormat, syncToken?: string): Promise<File> {
  const session = await getAuthenticatedSession();
  const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
  if (syncToken) headers["X-Inventory-Sync-Token"] = syncToken;
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventoryId}/exports/${format}`, {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { detail?: string } | undefined;
    throw new Error(body?.detail ?? "Não foi possível gerar o relatório.");
  }
  return new File([await response.blob()], filenameFrom(response, format), { type: mediaTypes[format] });
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  const revoke = URL.revokeObjectURL.bind(URL);
  window.setTimeout(() => revoke(url), 1_000);
}

export async function downloadReport(inventoryId: string, format: ReportFormat, syncToken?: string): Promise<void> {
  downloadFile(await fetchReportFile(inventoryId, format, syncToken));
}

export async function sharePdfReport(inventoryId: string, syncToken?: string): Promise<"shared" | "downloaded"> {
  const file = await fetchReportFile(inventoryId, "pdf", syncToken);
  const shareData: ShareData = { title: "Relatório de inventário", text: "Relatório final do inventário.", files: [file] };
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
    await navigator.share(shareData);
    return "shared";
  }
  downloadFile(file);
  return "downloaded";
}

export async function emailReports(inventoryId: string, formats: ReportFormat[]): Promise<string> {
  const session = await getAuthenticatedSession();
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventoryId}/email`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ formats }),
  });
  const body = await response.json().catch(() => undefined) as { message?: string; detail?: string } | undefined;
  if (!response.ok) throw new Error(body?.detail ?? "Não foi possível enviar os relatórios por e-mail.");
  return body?.message ?? "Relatório enviado por e-mail.";
}
