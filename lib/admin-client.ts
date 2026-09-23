import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedSession } from "@/lib/auth-client";
import type { InventoryEntry, ReferenceState } from "@/lib/models";

export interface AdminReferenceState extends ReferenceState {
  outsideLots: { lotNumber: string; physicalQuantity: number }[];
}

export interface AdminInventory {
  id: string;
  date: string;
  status: "OPEN" | "FINISHED";
  revision: number;
  operationalGeneration: number;
  tombstone: boolean;
  deletedAt?: string;
  createdAt: string;
  finalizedAt?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  recordCount: number;
  lotCount: number;
  pieceCount: number;
  reportVersion: number;
}

export interface AdminDetail extends AdminInventory {
  entries: InventoryEntry[];
  entryTotal: number;
  entryPage: number;
  entryPageSize: number;
  participants: { name: string; email: string }[];
  reference: ReferenceState;
}

export interface AdminAudit {
  id: string;
  inventoryId: string;
  action: string;
  actorName: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reportVersion: number;
  inventoryRevision: number;
  operationalGeneration: number;
  createdAt: string;
}

export interface AdminOverview {
  total: number;
  open: number;
  finished: number;
  lots: number;
  pieces: number;
  byPeriod: { period: string; count: number }[];
  recent: AdminInventory[];
  activities: AdminAudit[];
}

export interface AdminPage<T> { items: T[]; total: number; page?: number; pageSize?: number }
export interface AdminUser { id: string; name: string; email: string }
export interface ReportVersion { version: number; createdAt: string; revision: number; operationalGeneration: number }
export interface AssignedInventory { inventoryId: string; date: string; status: string; accessToken: string }

async function request(path: string, init?: RequestInit): Promise<Response> {
  const { accessToken } = await getAuthenticatedSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { detail?: string } | undefined;
    throw new Error(body?.detail ?? `Falha na consulta administrativa (${response.status}).`);
  }
  return response;
}

export async function adminGet<T>(path: string): Promise<T> {
  return (await request(`/api/v1/admin${path}`)).json() as Promise<T>;
}

export async function adminPost<T>(path: string, body: object): Promise<T> {
  return (await request(`/api/v1/admin${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })).json() as Promise<T>;
}

export async function adminUpload<T>(path: string, form: FormData): Promise<T> {
  return (await request(`/api/v1/admin${path}`, { method: "POST", body: form })).json() as Promise<T>;
}

export async function adminDownload(inventoryId: string, format: string, version?: number): Promise<void> {
  const response = await request(`/api/v1/admin/inventories/${inventoryId}/export/${format}${version ? `?version=${version}` : ""}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Inventario_${inventoryId.slice(0, 8)}_v${version ?? "atual"}.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function assignedInventories(): Promise<AssignedInventory[]> {
  return (await request("/api/v1/inventories/assigned")).json() as Promise<AssignedInventory[]>;
}
