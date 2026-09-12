"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAuthenticatedSession, restoreSession } from "@/lib/auth-client";
import { formatBrazilianDate } from "@/lib/local-date";
import {
  downloadReport,
  prepareReportsForSharing,
  reportErrorMessage,
  sharePreparedReport,
  type PreparedReports,
  type ReportFormat,
} from "@/lib/report-client";
import type { AnalysisClassification, AnalysisLocation, AnalysisSummary } from "@/lib/models";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";
const formats: ReportFormat[] = ["pdf", "xlsx", "docx"];

const formatLabel: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  docx: "Word",
};

interface ConsolidatedReport {
  inventoryId: string;
  inventoryDate: string;
  generatedAt: string;
  revision: number;
  totalPieces: number;
  totalRecords: number;
  summary: AnalysisSummary;
  records: Array<{ side: "EF" | "DE"; bay: string; lot: string; quantity: number }>;
  lots: Array<{ lot: string; totalQuantity: number; locations: AnalysisLocation[]; classification: AnalysisClassification; recommendation?: string }>;
}

export function HistoryDetail({ inventoryId }: { inventoryId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ConsolidatedReport>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  const [preparedReports, setPreparedReports] = useState<PreparedReports>({});

  useEffect(() => {
    let active = true;
    void restoreSession().then(async (user) => {
      if (!user) { router.replace("/acesso"); return; }
      try {
        const session = await getAuthenticatedSession();
        const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventoryId}/report`, { credentials: "include", headers: { Authorization: `Bearer ${session.accessToken}` } });
        const body = await response.json().catch(() => undefined) as ConsolidatedReport | { detail?: string } | undefined;
        if (!response.ok || !body || !("inventoryDate" in body)) throw new Error(body && "detail" in body ? body.detail : "Não foi possível abrir o relatório.");
        if (active) setReport(body);
      } catch (cause) { if (active) setError(reportErrorMessage(cause, "Não foi possível abrir o relatório.")); }
    });
    return () => { active = false; };
  }, [inventoryId, router]);

  async function run(label: string, action: () => Promise<string | void>): Promise<void> {
    setBusy(label); setMessage(undefined); setError(undefined);
    try { setMessage((await action()) || "Ação concluída."); }
    catch (cause) { setError(reportErrorMessage(cause, "Não foi possível concluir a ação.")); }
    finally { setBusy(undefined); }
  }

  async function toggleShare(): Promise<void> {
    if (shareOpen) {
      setShareOpen(false);
      return;
    }

    setShareOpen(true);
    if (formats.every((format) => preparedReports[format])) return;

    setPreparingShare(true);
    setMessage("Preparando os arquivos para o compartilhamento nativo…");
    setError(undefined);
    try {
      const files = await prepareReportsForSharing(inventoryId, formats);
      setPreparedReports(files);
      setMessage("Arquivos prontos. Escolha PDF, Excel ou Word para abrir o compartilhamento do celular.");
    } catch (cause) {
      setError(reportErrorMessage(cause, "Não foi possível preparar os arquivos para compartilhamento."));
    } finally {
      setPreparingShare(false);
    }
  }

  function shareAction(format: ReportFormat): void {
    const file = preparedReports[format];
    if (!file) {
      setError("Aguarde a preparação do arquivo antes de compartilhar.");
      return;
    }

    setBusy(`share-${format}`);
    setMessage(undefined);
    setError(undefined);

    // sharePreparedReport chama navigator.share() imediatamente neste clique.
    void sharePreparedReport(file, format)
      .then((result) => {
        if (result === "shared") setMessage(`Inventário compartilhado em ${formatLabel[format]}.`);
        else if (result === "cancelled") setMessage("Compartilhamento cancelado.");
        else setError(`O compartilhamento nativo de ${formatLabel[format]} não está disponível neste navegador. Tente pelo Chrome do celular.`);
      })
      .catch((cause) => setError(reportErrorMessage(cause, "Não foi possível abrir o compartilhamento nativo.")))
      .finally(() => setBusy(undefined));
  }

  const shareReady = formats.every((format) => preparedReports[format]);

  return <main className="shell">
    <header className="page-topbar"><Link className="back-link" href="/historico">‹ Voltar ao histórico</Link><div><p className="eyebrow">Relatório oficial</p><h1>{report ? `Inventário ${formatBrazilianDate(report.inventoryDate)}` : "Abrindo inventário…"}</h1><p className="muted">Modo somente leitura. O snapshot final permanece preservado.</p></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!report && !error ? <p className="muted">Carregando relatório central…</p> : null}
    {report ? <div className="stack">
      <section className="metric-grid" aria-label="Resumo final"><div className="metric-card"><span className="metric-label">Registros</span><span className="metric-value">{report.totalRecords}</span></div><div className="metric-card"><span className="metric-label">Lotes</span><span className="metric-value">{report.summary.lotsAnalyzed}</span></div><div className="metric-card"><span className="metric-label">Peças</span><span className="metric-value">{report.totalPieces}</span></div><div className="metric-card"><span className="metric-label">Fragmentados</span><span className="metric-value">{report.summary.fragmentedLots}</span></div></section>

      <section className="card section-card stack">
        <div><p className="eyebrow">Arquivos</p><h2>Compartilhar ou baixar</h2><p className="muted">Escolha o formato do inventário. No celular, o compartilhamento abre os aplicativos disponíveis no aparelho.</p></div>

        <button className="primary" disabled={Boolean(busy) || preparingShare} aria-expanded={shareOpen} aria-busy={preparingShare} onClick={() => void toggleShare()}>{preparingShare ? "Preparando compartilhamento…" : "Compartilhar inventário"}</button>

        {shareOpen ? <div className="details-box">
          <div className="details-content stack">
            <div><h3>Escolha o formato</h3><p className="muted">Os arquivos são preparados antes. Ao tocar no formato, o menu nativo do celular abre imediatamente.</p></div>
            <div className="export-grid">
              {formats.map((format) => <button className="secondary" disabled={Boolean(busy) || preparingShare || !shareReady} key={format} onClick={() => shareAction(format)}>Compartilhar {formatLabel[format]}</button>)}
            </div>
          </div>
        </div> : null}

        <details className="details-box">
          <summary>Baixar arquivo</summary>
          <div className="details-content">
            <div className="export-grid">
              {formats.map((format) => <button className="secondary" disabled={Boolean(busy)} key={format} onClick={() => void run(format, async () => { await downloadReport(inventoryId, format); return `${formatLabel[format]} baixado.`; })}>Baixar {formatLabel[format]}</button>)}
            </div>
          </div>
        </details>

        {message ? <p className="notice" role="status">{message}</p> : null}
      </section>

      <section className="card section-card stack"><div><p className="eyebrow">Conferência</p><h2>Lotes consolidados</h2></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Lote</th><th>Total físico</th><th>Locais</th><th>Classificação</th></tr></thead><tbody>{report.lots.map((lot) => <tr key={lot.lot}><td>{lot.lot}</td><td>{lot.totalQuantity}</td><td>{lot.locations.map((location) => `${location.side} · ${location.bay} (${location.quantity})`).join(", ")}</td><td><span className={`classification-tag ${lot.classification === "OK" ? "good" : "attention"}`}>{lot.classification.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div></section>
    </div> : null}
  </main>;
}
