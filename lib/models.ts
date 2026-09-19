export type Side = "EF" | "DE";
export const INVENTORY_LAYERS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as const;
export type InventoryLayer = (typeof INVENTORY_LAYERS)[number];
export type SyncStatus = "PENDING" | "SYNCED" | "ERROR";
export type ReferenceSourceType = "SAP_EXCEL";
export type ReferenceLotStatus = "EXPECTED_FOUND" | "EXPECTED_MISSING" | "OUTSIDE_REFERENCE";
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
  /** Presente quando este dispositivo iniciou o inventário; o servidor continua sendo a autoridade. */
  isOwner?: boolean;
  /** Código amigável de seis dígitos, emitido pelo servidor enquanto aberto. */
  participationCode?: string;
}

export interface InventoryReference {
  id: string;
  inventoryId: string;
  sourceType: ReferenceSourceType;
  originalFilename: string;
  importedAt: string;
  updatedAt: string;
  totalLots: number;
  revision: number;
  createdByName?: string;
  status: "ACTIVE";
  lotsComplete: boolean;
}

export interface ReferenceLotItem {
  lotNumber: string;
  foundPhysically: boolean;
  physicalQuantity: number;
  physicalOccurrences: number;
  fragmented: boolean;
}

export interface LocalReferenceLot {
  id: string;
  inventoryId: string;
  lotNumber: string;
}

export interface ReferenceSummary {
  available: boolean;
  totalLots: number;
  foundLots: number;
  pendingLots: number;
  outsideReferenceLots: number;
  fragmentedLots: number;
  physicalDistinctLots: number;
}

export interface ReferenceState {
  reference?: InventoryReference;
  summary: ReferenceSummary;
  lots: ReferenceLotItem[];
  page: number;
  pageSize: number;
  totalMatchingLots: number;
  totalPages: number;
}

export interface ReferenceColumn {
  index: number;
  label: string;
}

export interface ReferencePreview {
  originalFilename: string;
  sourceType: ReferenceSourceType;
  headerRow?: number;
  columns: ReferenceColumn[];
  selectedColumn?: number;
  selectedColumnLabel?: string;
  requiresColumnSelection: boolean;
  totalRows: number;
  validLotOccurrences: number;
  uniqueLots: number;
  duplicateRows: number;
  ignoredRows: number;
  sample: string[];
  warnings: string[];
}

export interface ReferenceImportSummary {
  totalRows: number;
  validLotOccurrences: number;
  uniqueLots: number;
  duplicateRows: number;
  ignoredRows: number;
  sample: string[];
  warnings: string[];
}

export interface InventoryEntry extends LocalRecord {
  inventoryId: string;
  side: Side;
  bay: string;
  /** A camada é opcional; quando informada deve estar entre A1 e A10. */
  layer?: InventoryLayer | null;
  lot: string;
  quantity: number;
  createdByUserId?: string;
  createdByName?: string;
  duplicateConfirmed?: boolean;
}

export interface EntryDraft {
  side: Side;
  bay: string;
  layer?: InventoryLayer | null;
  lot: string;
  quantity: number;
}

export interface AnalysisLocation {
  side: Side;
  bay: string;
  layer?: InventoryLayer | null;
  quantity: number;
}

export type PresentationTone = "ok" | "single-piece" | "multiple-pieces" | "distributed" | "review";

export interface PresentationLocation {
  label: string;
  display: string;
  quantity: number;
  isPrimary: boolean;
}

export interface LotPresentation {
  situation: string;
  tone: PresentationTone;
  requiresConference: boolean;
  primaryLocation: PresentationLocation | null;
  otherLocations: PresentationLocation[];
  locations: PresentationLocation[];
  outOfPrimaryQuantity: number | null;
  action: string;
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
  /** Presente nas respostas novas; caches antigos podem não ter este campo. */
  presentation?: LotPresentation;
  referenceStatus?: ReferenceLotStatus;
  physicalFound?: boolean;
}

export interface AnalysisSummary {
  lotsAnalyzed: number;
  regularLots: number;
  fragmentedLots: number;
  loosePieces: number;
  displacedGroups: number;
  ambiguousDistributions: number;
  reviewItems: number;
  lotsOk?: number;
  lotsForConference?: number;
  singlePieceOutsideLots?: number;
  multiplePiecesOutsideLots?: number;
  distributedLots?: number;
  reviewLots?: number;
}

export interface AnalysisReport {
  inventoryId: string;
  revision: number;
  generatedAt: string;
  lots: LotAnalysis[];
  summary: AnalysisSummary;
  reference?: ReferenceSummary & {
    sourceType?: ReferenceSourceType;
    originalFilename?: string;
    importedAt?: string;
    updatedAt?: string;
    missingLots?: number;
  };
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
