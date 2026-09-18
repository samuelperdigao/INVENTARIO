"use client";

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { getInventory } from "@/lib/inventory-repository";
import {
  checkReferenceLot,
  getReferenceState,
  importReference,
  previewReference,
  removeReference,
} from "@/lib/reference-client";
import { syncInventory } from "@/lib/sync-client";
import { LOT_LENGTH, sanitizeLotInput } from "@/lib/lot-rules";
import type { Inventory, ReferencePreview, ReferenceState } from "@/lib/models";

interface ReferencePanelProps {
  inventory: Inventory;
  onChanged: () => Promise<void>;
}

function importedAtLabel(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function summaryLabel(value: number): string {
  return value.toLocaleString("pt-BR");
}

export function ReferencePanel({ inventory, onChanged }: ReferencePanelProps) {
  const [state, setState] = useState<ReferenceState>();
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ReferencePreview>();
  const [showImporter, setShowImporter] = useState(false);
  const [continuedWithoutReference, setContinuedWithoutReference] = useState(false);
  const [showLots, setShowLots] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    let active = true;
    void getReferenceState(inventory, page, query)
      .then((next) => {
        if (!active) return;
        setState(next);
        if (!next.reference) setShowLots(false);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar a referência de lotes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [inventory, page, query]);

  function resetImporter(): void {
    setFile(undefined);
    setPreview(undefined);
  }

  async function ensureCentralInventory(): Promise<Inventory> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Conecte-se para importar a referência. Os lançamentos continuam funcionando offline.");
    }
    await syncInventory(inventory.id);
    await onChanged();
    return (await getInventory(inventory.id)) ?? inventory;
  }

  async function handlePreview(): Promise<void> {
    if (!file) {
      setError("Escolha um arquivo .xlsx exportado do SAP.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const current = await ensureCentralInventory();
      const next = await previewReference(current, file);
      setPreview(next);
      setMessage("Prévia pronta. Confira os lotes identificados na coluna ‘Lotes’ antes de confirmar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler a planilha Excel.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!file || !preview || preview.requiresColumnSelection || preview.uniqueLots === 0) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const current = await ensureCentralInventory();
      const result = await importReference(current, file);
      const next = await getReferenceState(current, 1, "");
      setState(next);
      setPage(1);
      setQueryInput("");
      setQuery("");
      setShowImporter(false);
      setShowLots(false);
      setContinuedWithoutReference(false);
      resetImporter();
      await onChanged();
      setMessage(`${summaryLabel(result.importSummary.uniqueLots)} lotes importados. A coleta continua liberada para qualquer lote.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar a referência de lotes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await removeReference(inventory);
      const next = await getReferenceState(inventory, 1, "");
      setState(next);
      setShowImporter(false);
      setShowLots(false);
      setRemoveOpen(false);
      await onChanged();
      setMessage("Referência removida. Nenhum lançamento físico foi apagado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover a referência de lotes.");
    } finally {
      setBusy(false);
    }
  }

  const reference = state?.reference;
  const canEditReference = inventory.status === "OPEN";
  const selectedPreviewReady = Boolean(preview && !preview.requiresColumnSelection);
  const referenceStatus = error ? "Com erro" : busy ? "Processando" : reference ? "Planilha importada" : continuedWithoutReference ? "Não utilizada" : "Opcional";

  return <>
    <section className="card section-card panel-card stack reference-panel" aria-label="Referência SAP">
      <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">06</span>
          <div className="panel-copy">
            <p className="eyebrow">Antes do primeiro lançamento</p>
            <h2>Referência SAP</h2>
            <p className="muted">Opcional: importe os lotes do SAP para comparar a conferência depois. A coleta física nunca fica bloqueada.</p>
          </div>
        </div>
        <span className={`micro-pill ${reference ? "good" : continuedWithoutReference ? "attention" : ""}`}>{referenceStatus}</span>
      </div>

      {loading && !state ? <p className="muted">Carregando referência…</p> : null}

      {!reference && !showImporter ? <div className={`reference-empty ${continuedWithoutReference ? "reference-empty-compact" : ""}`}>
        <p className="muted">{continuedWithoutReference ? "Sem planilha: a coleta física continua liberada para qualquer lote." : "Você pode continuar sem referência e registrar normalmente. Se houver um arquivo do SAP, importe-o para comparar presença de lotes depois."}</p>
        <div className="actions">
          {canEditReference ? <button className="primary" type="button" onClick={() => { setShowImporter(true); setMessage(undefined); setError(undefined); }}>Importar planilha SAP</button> : null}
          {!continuedWithoutReference ? <button className="secondary" type="button" aria-label="Continuar sem planilha SAP" onClick={() => { setContinuedWithoutReference(true); setMessage("Sem referência: a coleta física continua disponível normalmente."); }}>Continuar sem planilha</button> : null}
        </div>
      </div> : null}

      {reference && !showImporter ? <div className="reference-card-content stack">
        <div className="reference-file-meta">
          <strong>✓ Planilha importada</strong>
          <span>Arquivo: {reference.originalFilename}</span>
          <span>{summaryLabel(reference.totalLots)} lotes importados · {importedAtLabel(reference.importedAt)}</span>
        </div>
        {state ? <div className="reference-summary" aria-label="Resumo da referência">
          <span><strong>{summaryLabel(state.summary.totalLots)}</strong> previstos</span>
          <span><strong>{summaryLabel(state.summary.foundLots)}</strong> encontrados</span>
          <span><strong>{summaryLabel(state.summary.pendingLots)}</strong> pendentes</span>
          <span className={state.summary.outsideReferenceLots ? "reference-summary-alert" : ""}><strong>{summaryLabel(state.summary.outsideReferenceLots)}</strong> fora da referência</span>
          <span><strong>{summaryLabel(state.summary.fragmentedLots)}</strong> fragmentados</span>
        </div> : null}
        <div className="actions">
          <button className="secondary" type="button" onClick={() => setShowLots((current) => !current)}>{showLots ? "Ocultar lotes" : "Visualizar lotes"}</button>
          {canEditReference ? <button className="secondary" type="button" onClick={() => { setShowImporter(true); setMessage(undefined); setError(undefined); }}>Substituir arquivo</button> : null}
          {canEditReference ? <button className="danger" type="button" onClick={() => setRemoveOpen(true)} disabled={busy}>Remover referência</button> : null}
        </div>
      </div> : null}

      {showImporter && canEditReference ? <div className="reference-importer details-box">
        <div className="details-content stack">
          <div>
            <h3>{reference ? "Substituir referência" : "Importar planilha SAP"}</h3>
            <p className="muted">O arquivo é lido em memória. Após a confirmação, ficam salvos apenas os números de lote.</p>
          </div>
          <label className="field" htmlFor="reference-file">Arquivo Excel (.xlsx)
            <input
              id="reference-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0]);
                setPreview(undefined);
                setError(undefined);
                setMessage(undefined);
              }}
            />
          </label>
          {file ? <p className="notice">Arquivo carregado: {file.name}</p> : null}
          {!preview ? <button className="primary" type="button" onClick={() => void handlePreview()} disabled={busy || !file}>{busy ? "Lendo arquivo…" : "Pré-visualizar importação"}</button> : null}
          {preview && selectedPreviewReady ? <div className="reference-preview" aria-label="Prévia da importação">
            <div className="reference-preview-heading"><strong>Coluna identificada: {preview.selectedColumnLabel ?? "Lotes"}</strong><span>{summaryLabel(preview.uniqueLots)} lotes válidos</span></div>
            <div className="reference-summary">
              <span>{summaryLabel(preview.duplicateRows)} duplicados</span>
              <span>{summaryLabel(preview.ignoredRows)} linhas ignoradas</span>
              <span>{summaryLabel(preview.validLotOccurrences)} valores válidos</span>
            </div>
            <p className="muted">Amostra: {preview.sample.join(" · ")}</p>
            {preview.warnings.length ? <ul className="reference-warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            {!preview.uniqueLots ? <p className="error" role="alert">Nenhum lote válido foi encontrado na coluna ‘Lotes’. Confira o arquivo antes de tentar confirmar.</p> : null}
            <div className="actions">
              <button className="primary" type="button" onClick={() => void handleImport()} disabled={busy || preview.uniqueLots === 0}>{busy ? "Importando…" : "Confirmar importação"}</button>
              <button className="secondary" type="button" onClick={resetImporter} disabled={busy}>Cancelar</button>
            </div>
          </div> : null}
          {reference ? <button className="text-button" type="button" onClick={() => { resetImporter(); setShowImporter(false); }}>Voltar para a referência atual</button> : null}
        </div>
      </div> : null}

      {showLots && reference && state ? <div className="reference-lots-view stack">
        <div className="section-header">
          <div><h3>Lotes importados</h3><p className="muted">Somente os números de lote são exibidos.</p></div>
          <span className="micro-pill">{summaryLabel(state.totalMatchingLots)} resultado(s)</span>
        </div>
        <label className="field" htmlFor="reference-search">Buscar lote
          <input id="reference-search" value={queryInput} maxLength={LOT_LENGTH} onChange={(event) => { setLoading(true); setQueryInput(sanitizeLotInput(event.target.value)); setPage(1); }} inputMode="numeric" placeholder="Número do lote" />
        </label>
        {state.lots.length ? <>
          <div className="reference-lot-table-wrap">
            <table className="reference-lot-table"><thead><tr><th>Lote</th><th>Físico</th><th>Qtd. física</th><th>Condição</th></tr></thead><tbody>
              {state.lots.map((lot) => <tr key={lot.lotNumber}><td>{lot.lotNumber}</td><td>{lot.foundPhysically ? "Encontrado" : "Pendente"}</td><td>{lot.physicalQuantity || "—"}</td><td>{lot.fragmented ? "Fragmentado" : lot.foundPhysically ? "Previsto" : "Ainda não encontrado"}</td></tr>)}
            </tbody></table>
          </div>
          <div className="reference-lot-cards">
            {state.lots.map((lot) => <article className="reference-lot-card" key={lot.lotNumber}><strong>{lot.lotNumber}</strong><span>{lot.foundPhysically ? "✓ Encontrado" : "Pendente"}</span><span>{lot.physicalQuantity ? `${lot.physicalQuantity} peça(s) física(s)` : "Ainda não encontrado"}</span><span>{lot.fragmented ? "Fragmentado" : lot.foundPhysically ? "Previsto" : "Aguardando conferência"}</span></article>)}
          </div>
        </> : <p className="empty-state">Nenhum lote encontrado para esta busca.</p>}
        {state.totalPages > 1 ? <div className="reference-pagination" aria-label="Paginação dos lotes">
          <button className="secondary" type="button" onClick={() => { setLoading(true); setPage((current) => Math.max(1, current - 1)); }} disabled={state.page <= 1}>Anterior</button>
          <span>Página {state.page} de {state.totalPages}</span>
          <button className="secondary" type="button" onClick={() => { setLoading(true); setPage((current) => Math.min(state.totalPages, current + 1)); }} disabled={state.page >= state.totalPages}>Próxima</button>
        </div> : null}
      </div> : null}

      {message ? <p className="notice" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
    <ConfirmDialog
      open={removeOpen}
      title="Remover referência de lotes?"
      description="A referência será removida, mas nenhum lançamento físico, quantidade ou localização será apagado. A coleta continuará disponível sem comparação."
      confirmLabel="Remover referência"
      busyLabel="Removendo…"
      busy={busy}
      onConfirm={() => void handleRemove()}
      onClose={() => setRemoveOpen(false)}
    />
  </>;
}

export function createReferenceLotChecker(inventory: Inventory): (lot: string) => Promise<boolean | null> {
  return (lot) => checkReferenceLot(inventory, lot);
}
