"use client";

import { useEffect, useState } from "react";

import { getCachedReport, requestAnalysis } from "@/lib/analysis-client";
import type { AnalysisReport, Inventory, InventoryEntry } from "@/lib/models";

interface AnalysisPanelProps {
  inventory: Inventory;
  entries: InventoryEntry[];
}

export function AnalysisPanel({ inventory, entries }: AnalysisPanelProps) {
  const [report, setReport] = useState<AnalysisReport>();
  const [fromCache, setFromCache] = useState(false);
  const [possiblyStale, setPossiblyStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

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
    <section className="card stack" aria-label="Análise">
      <div className="topbar"><h2>Análise</h2><button className="secondary" type="button" onClick={() => void handleAnalysis()} disabled={loading}>{loading ? "Analisando…" : "Atualizar análise"}</button></div>
      {fromCache && report ? <p className="notice">Resultado em cache{possiblyStale ? ", possivelmente desatualizado" : ""}.</p> : null}
      {message && !fromCache ? <p className="error" role="alert">{message}</p> : null}
      {!report ? <p className="muted">A análise nova exige conexão com o serviço FastAPI.</p> : null}
      {report ? <>
        <p><strong>{report.summary.lotsAnalyzed}</strong> lote(s) analisado(s) · <strong>{report.summary.fragmentedLots}</strong> fragmentado(s)</p>
        <ul className="report-list">
          {report.lots.map((lot) => <li key={lot.lot}>
            <strong>Lote {lot.lot}</strong> · {lot.totalQuantity} peça(s) · <span className="report-classification">{lot.classification}</span>
            {lot.recommendation ? <><br /><span className="muted">{lot.recommendation}</span></> : null}
          </li>)}
        </ul>
      </> : null}
    </section>
  );
}
