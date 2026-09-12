"use client";

import { getAuthenticatedSession } from "@/lib/auth-client";

export type ReportFormat = "pdf" | "xlsx" | "docx";
export type ShareReportResult = "shared" | "cancelled" | "unsupported";
export type PreparedReports = Partial<Record<ReportFormat, File>>;

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
  if (isPermissionDenied(cause)) {
    return "O navegador bloqueou o compartilhamento nativo. Tente novamente pelo navegador do celular.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(cause.message)) {
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  }
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

export async function prepareReportsForSharing(
  inventoryId: string,
  formats: ReportFormat[] = ["pdf", "xlsx", "docx"],
  syncToken?: string,
): Promise<PreparedReports> {
  const entries = await Promise.all(
    formats.map(async (format) => [format, await fetchReportFile(inventoryId, format, syncToken)] as const),
  );
  return Object.fromEntries(entries) as PreparedReports;
}

export function sharePreparedReport(file: File, format: ReportFormat): Promise<ShareReportResult> {
  const shareData: ShareData = {
    title: `Inventário em ${formatLabels[format]}`,
    text: `Relatório final do inventário em ${formatLabels[format]}.`,
    files: [file],
  };

  if (typeof navigator.share !== "function") {
    return Promise.resolve("unsupported");
  }
  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
    return Promise.resolve("unsupported");
  }

  // navigator.share() é chamado imediatamente, sem nenhum await anterior,
  // preservando a ativação transitória gerada pelo toque/clique do usuário.
  return navigator.share(shareData)
    .then(() => "shared" as const)
    .catch((cause: unknown) => {
      if (isDomExceptionNamed(cause, "AbortError")) return "cancelled" as const;
      throw new Error(reportErrorMessage(cause, "Não foi possível abrir o compartilhamento nativo."));
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
