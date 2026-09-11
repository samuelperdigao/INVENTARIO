export type Side = "EF" | "DE";
export type SyncStatus = "PENDING" | "SYNCED" | "ERROR";
export type AnalysisClassification =
  | "OK"
  | "PEÇA_SOLTEIRA"
  | "GRUPO_DESLOCADO"
  | "DISTRIBUIÇÃO_AMBÍGUA"
  | "REVISAR";

export interface LocalRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  syncStatus: SyncStatus;
  tombstone: boolean;
  deletedAt?: string;
}

export interface Inventory extends LocalRecord {
  date: string;
  status: "OPEN";
}

export interface InventoryEntry extends LocalRecord {
  inventoryId: string;
  side: Side;
  bay: string;
  lot: string;
  quantity: number;
}

export interface EntryDraft {
  side: Side;
  bay: string;
  lot: string;
  quantity: number;
}

export interface AnalysisLocation {
  side: Side;
  bay: string;
  quantity: number;
}

export interface LotAnalysis {
  lot: string;
  totalQuantity: number;
  locations: AnalysisLocation[];
  fragmented: boolean;
  classification: AnalysisClassification;
  primaryLocation?: AnalysisLocation;
  displacedQuantity: number;
  recommendation?: string;
}

export interface AnalysisSummary {
  lotsAnalyzed: number;
  regularLots: number;
  fragmentedLots: number;
  loosePieces: number;
  displacedGroups: number;
  ambiguousDistributions: number;
  reviewItems: number;
}

export interface AnalysisReport {
  inventoryId: string;
  revision: number;
  generatedAt: string;
  lots: LotAnalysis[];
  summary: AnalysisSummary;
}

export interface AnalysisCache {
  id: string;
  inventoryId: string;
  revision: number;
  report: AnalysisReport;
  cachedAt: string;
}
