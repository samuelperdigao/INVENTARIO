"use client";

import { getAuthenticatedSession } from "@/lib/auth-client";

export type ReportFormat = "pdf" | "xlsx" | "docx";
export type ShareReportResult = "shared" | "downloaded" | "cancelled";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

const mediaTypes: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const formatLabels: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  docx: "Word",
};

function filenameFrom(response: Response, format: ReportFormat): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `Inventario.${format}`;
}

function isDomExceptionNamed(cause: unknown, ...names: string[]): boolean {
  return cause instanceof DOMException && names.includes(cause.name);
}

function isPermissionDenied(cause: unknown): boolean {
  if (isDomExceptionNamed(cause, "NotAllowedError", "SecurityError")) return true;
  if (!(cause instanceof Error)) return false;
  return /permission denied|not allowed|permission policy/i.test(cause.message);
}

export function reportErrorMessage(cause: unknown, fallback = "Não foi possível concluir a operação."): string {
  if (!(cause instanceof Error)) return fallback;
  if (isDomExceptionNamed(cause, "AbortError")) return "Compartilhamento cancelado.";
  if (isPermissionDenied(cause)) return "O navegador não permitiu compartilhar este arquivo.";
  if (/failed to fetch|networkerror|load failed/i.test(cause.message)) {
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  }
  if (/permission denied/i.test(cause.message)) return "Permissão negada pelo navegador.";
  return cause.message || fallback;
}

export async function fetchReportFile(inventoryId: string, format: ReportFormat, syncToken?: string): Promise<File> {
  const session = await getAuthenticatedSession();
  const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
  if (syncToken) headers["X-Inventory-Sync-Token"] = syncToken;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventoryId}/exports/${format}`, {
      credentials: "include",
      headers,
    });
  } catch (cause) {
    throw new Error(reportErrorMessage(cause, "Não foi possível buscar o arquivo do inventário."));
  }

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

export async function shareReport(
  inventoryId: string,
  format: ReportFormat,
  syncToken?: string,
): Promise<ShareReportResult> {
  const file = await fetchReportFile(inventoryId, format, syncToken);
  const shareData: ShareData = {
    title: `Inventário em ${formatLabels[format]}`,
    text: `Relatório final do inventário em ${formatLabels[format]}.`,
    files: [file],
  };

  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || !navigator.canShare(shareData)) {
    downloadFile(file);
    return "downloaded";
  }

  try {
    await navigator.share(shareData);
    return "shared";
  } catch (cause) {
    if (isDomExceptionNamed(cause, "AbortError")) return "cancelled";

    // Alguns navegadores/ambientes anunciam suporte ao arquivo em canShare,
    // mas recusam a abertura do painel nativo com NotAllowedError/Permission denied.
    // Nesses casos, preserve a ação do usuário baixando o arquivo escolhido.
    if (isPermissionDenied(cause) || isDomExceptionNamed(cause, "TypeError")) {
      downloadFile(file);
      return "downloaded";
    }

    throw new Error(reportErrorMessage(cause, "Não foi possível compartilhar o inventário."));
  }
}

export async function sharePdfReport(inventoryId: string, syncToken?: string): Promise<ShareReportResult> {
  return shareReport(inventoryId, "pdf", syncToken);
}
