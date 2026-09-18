"use client";

import { useEffect, useState } from "react";

import { getCachedReport, requestAnalysis } from "@/lib/analysis-client";
import type { AnalysisReport, Inventory, InventoryEntry } from "@/lib/models";

interface AnalysisPanelProps {
  inventory: Inventory;
  entries: InventoryEntry[];
  embedded?: boolean;
  onStateChange?: (state: AnalysisState) => void;
}

export type AnalysisState = "idle" | "loading" | "ready" | "attention";

export function AnalysisPanel({ inventory, entries, embedded = false, onStateChange }: AnalysisPanelProps) {
  const [report, setReport] = useState<AnalysisReport>();
  const [fromCache, setFromCache] = useState(false);
  const [possiblyStale, setPossiblyStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    onStateChange?.(loading ? "loading" : report ? possiblyStale ? "attention" : "ready" : "idle");
  }, [loading, onStateChange, possiblyStale, report]);

  useEffect(() => {
    let active = true;
    void getCachedReport(inventory.id, inventory.revision).then((cache) => {
      if (!active || !cache) return;
      setReport(cache.report);
      setFromCache(true);
      setPossiblyStale(cache.revision !== inventory.revision);
    }).catch(() => {
      // O cache é opcional; indisponibilidade dele não pode impedir o lançamento local.
    });
    return () => { active = false; };
  }, [inventory.id, inventory.revision]);

  async function handleAnalysis(): Promise<void> {
    const online = typeof navigator === "undefined" || navigator.onLine;
    if (!online) {
      setMessage(report ? "Offline: exibindo o último resultado em cache, possivelmente desatualizado." : "Offline: não há análise em cache para esta revisão.");
      setFromCache(true);
      setPossiblyStale(true);
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      const freshReport = await requestAnalysis(inventory, entries);
      setReport(freshReport);
      setFromCache(false);
      setPossiblyStale(false);
    } catch {
      setFromCache(true);
      setPossiblyStale(true);
      setMessage(report ? "Não foi possível atualizar. Exibindo o último resultado em cache, possivelmente desatualizado." : "Não foi possível gerar a análise agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={embedded ? "control-stage-content stack" : "card section-card panel-card stack"} aria-label="Análise">
      {!embedded ? <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">04</span>
          <div className="panel-copy">
            <p className="eyebrow">Consolidação inteligente</p>
            <h2>Análise</h2>
            <p className="muted">Consolida os registros por lote e destaca os lotes que precisam de conferência física.</p>
          </div>
        </div>
        <button className="secondary" type="button" onClick={() => void handleAnalysis()} disabled={loading}>{loading ? "Analisando…" : "Atualizar análise"}</button>
      </div> : <div className="control-stage-inline-action"><p className="muted">Atualize a análise online para revisar os lotes que precisam de conferência física.</p><button className="secondary" type="button" onClick={() => void handleAnalysis()} disabled={loading} aria-busy={loading}>{loading ? "Analisando…" : "Atualizar análise"}</button></div>}
      {fromCache && report ? <p className="notice">Resultado em cache{possiblyStale ? ", possivelmente desatualizado" : ""}.</p> : null}
      {message && !fromCache ? <p className="error" role="alert">{message}</p> : null}
      {!report ? <p className="muted">Conecte-se à internet para atualizar a análise. Os lançamentos locais continuam disponíveis sem internet.</p> : null}
      {report ? <>
        <div className="inventory-card-meta">
          <span className="micro-pill good">{report.summary.lotsOk ?? report.summary.regularLots} lote(s) OK</span>
          <span className={`micro-pill ${(report.summary.lotsForConference ?? report.summary.fragmentedLots) === 0 ? "good" : ""}`}>{report.summary.lotsForConference ?? report.summary.fragmentedLots} lote(s) para conferência</span>
        </div>
        <ul className="report-list">
          {report.lots.map((lot) => <li key={lot.lot}>
            <strong>Lote {lot.lot}</strong> · {lot.totalQuantity} peça(s) · <span className={`classification-tag ${lot.presentation?.tone ?? (lot.classification === "OK" ? "ok" : "review")}`}>{lot.presentation?.situation ?? (lot.classification === "OK" ? "OK" : "LOTE PARA CONFERÊNCIA")}</span>
            {lot.presentation?.action && lot.presentation.requiresConference ? <><br /><span className="muted">{lot.presentation.action}</span></> : null}
          </li>)}
        </ul>
      </> : null}
    </section>
  );
}
