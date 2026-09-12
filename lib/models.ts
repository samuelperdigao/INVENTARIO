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
  /** Revisão confirmada pelo servidor antes da alteração local atual. */
  syncBaseRevision: number;
  syncStatus: SyncStatus;
  tombstone: boolean;
  deletedAt?: string;
}

export interface Inventory extends LocalRecord {
  date: string;
  status: "OPEN" | "FINISHED";
  /** Segredo de capacidade local para acessar o inventário central. */
  syncToken: string;
  /** Código amigável de seis dígitos, emitido pelo servidor enquanto aberto. */
  participationCode?: string;
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

export interface SyncMetadata {
  id: string;
  deviceId?: string;
  cursor?: number;
}

export interface SyncConflict {
  id: string;
  inventoryId: string;
  entityType: "inventory" | "entry";
  entityId: string;
  localRecord: Inventory | InventoryEntry;
  serverRecord: Inventory | InventoryEntry;
  createdAt: string;
}
