"use client";

import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedSession } from "@/lib/auth-client";

export type ReportFormat = "xls" | "xlsx" | "pdf" | "docx";
export type ShareableReportFormat = "xlsx" | "pdf" | "docx";
export type ShareReportResult = "shared" | "cancelled" | "unsupported";
export type PreparedShareResources = {
  pdf?: File;
  xlsx?: string;
  docx?: string;
};

const mediaTypes: Record<ReportFormat, string> = {
  xls: "application/vnd.ms-excel",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const formatLabels: Record<ReportFormat, string> = {
  xls: "Excel compatível (.xls)",
  xlsx: "Excel moderno (.xlsx)",
  pdf: "PDF",
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
  if (isDomExceptionNamed(cause, "AbortError")) return "Compartilhamento cancelado.";
  if (isPermissionDenied(cause)) {
    return "O navegador bloqueou o compartilhamento nativo. Tente novamente pelo navegador do celular.";
  }
  if (!(cause instanceof Error)) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(cause.message)) {
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  }
  return cause.message || fallback;
}

async function authHeaders(syncToken?: string): Promise<Record<string, string>> {
  const session = await getAuthenticatedSession();
  const headers: Record<string, string> = { Authorization: `Bearer ${session.accessToken}` };
  if (syncToken) headers["X-Inventory-Sync-Token"] = syncToken;
  return headers;
}

export async function fetchReportFile(inventoryId: string, format: ReportFormat, syncToken?: string): Promise<File> {
  let response: Response;
  try {
    const path = format === "xls" || format === "xlsx"
      ? `/api/v1/inventories/${inventoryId}/export/excel?format=${format}`
      : `/api/v1/inventories/${inventoryId}/exports/${format}`;
    response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
      headers: await authHeaders(syncToken),
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

function publicShareUrl(path: string): string {
  if (apiBaseUrl.startsWith("/")) {
    return `${window.location.origin}${apiBaseUrl}${path}`;
  }
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

export async function createTemporaryShareLink(
  inventoryId: string,
  format: "xlsx" | "docx",
  syncToken?: string,
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventoryId}/share-links/${format}`, {
    method: "POST",
    credentials: "include",
    headers: await authHeaders(syncToken),
  });
  const body = await response.json().catch(() => undefined) as { path?: string; detail?: string } | undefined;
  if (!response.ok || !body?.path) {
    throw new Error(body?.detail ?? "Não foi possível preparar o compartilhamento do arquivo.");
  }
  return publicShareUrl(body.path);
}

export async function prepareResourcesForSharing(
  inventoryId: string,
  syncToken?: string,
): Promise<PreparedShareResources> {
  const [pdf, xlsx, docx] = await Promise.all([
    fetchReportFile(inventoryId, "pdf", syncToken),
    createTemporaryShareLink(inventoryId, "xlsx", syncToken),
    createTemporaryShareLink(inventoryId, "docx", syncToken),
  ]);
  return { pdf, xlsx, docx };
}

function shareWithNative(shareData: ShareData): Promise<ShareReportResult> {
  if (typeof navigator.share !== "function") return Promise.resolve("unsupported");

  return navigator.share(shareData)
    .then(() => "shared" as const)
    .catch((cause: unknown) => {
      if (isDomExceptionNamed(cause, "AbortError")) return "cancelled" as const;
      throw new Error(reportErrorMessage(cause, "Não foi possível abrir o compartilhamento nativo."));
    });
}

export function sharePreparedResource(
  resource: File | string,
  format: ReportFormat,
): Promise<ShareReportResult> {
  if (resource instanceof File) {
    const shareData: ShareData = {
      title: `Inventário em ${formatLabels[format]}`,
      text: `Relatório final do inventário em ${formatLabels[format]}.`,
      files: [resource],
    };
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [resource] })) {
      return Promise.resolve("unsupported");
    }
    return shareWithNative(shareData);
  }

  return shareWithNative({
    title: `Inventário em ${formatLabels[format]}`,
    text: `Acesse o arquivo ${formatLabels[format]} do inventário:\n${resource}`,
    url: resource,
  });
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
