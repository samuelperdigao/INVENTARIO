const fallbackApiBaseUrl = "/backend-api";

function normalizeApiBaseUrl(value: string | undefined): string | undefined {
  return value?.trim().replace(/\/$/, "") || undefined;
}

const analysisUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL);
const syncUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_SYNC_API_BASE_URL);

export const analysisApiBaseUrl =
  analysisUrl ?? syncUrl ?? fallbackApiBaseUrl;

export const apiBaseUrl =
  syncUrl ?? analysisUrl ?? fallbackApiBaseUrl;
