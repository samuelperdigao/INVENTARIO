"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedSession, restoreSession } from "@/lib/auth-client";
import { formatBrazilianDate } from "@/lib/local-date";
import {
  downloadReport,
  prepareResourcesForSharing,
  reportErrorMessage,
  sharePreparedResource,
  type PreparedShareResources,
  type ReportFormat,
  type ShareableReportFormat,
} from "@/lib/report-client";
import { LotLocations } from "@/components/lot-locations";
import { AppRail } from "@/components/app-rail";
import { Icon } from "@/components/icon";
import type { AnalysisSummary, LotAnalysis, LotPresentation, PresentationTone } from "@/lib/models";

const shareFormats: ShareableReportFormat[] = ["pdf", "xlsx", "docx"];
const downloadFormats: ReportFormat[] = ["xls", "xlsx", "pdf", "docx"];

const formatLabel: Record<ReportFormat, string> = {
  xls: "Excel compatível (.xls)",
  xlsx: "Excel moderno (.xlsx)",
  pdf: "PDF",
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
  records: Array<{ side: "EF" | "DE"; bay: string; layer?: string | null; lot: string; quantity: number }>;
  lots: LotAnalysis[];
}

function visibleSituation(lot: LotAnalysis): string {
  return lot.presentation?.situation ?? (lot.classification === "OK" ? "OK" : "LOTE PARA CONFERÊNCIA");
}

function presentationTone(lot: LotAnalysis): PresentationTone {
  return lot.presentation?.tone ?? (lot.classification === "OK" ? "ok" : "review");
}

function requiresConference(lot: LotAnalysis): boolean {
  return lot.presentation?.requiresConference ?? lot.classification !== "OK";
}

export function HistoryDetail({ inventoryId }: { inventoryId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<ConsolidatedReport>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  const [preparedResources, setPreparedResources] = useState<PreparedShareResources>({});

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
    if (preparedResources.pdf && preparedResources.xlsx && preparedResources.docx) return;

    setPreparingShare(true);
    setMessage("Preparando o compartilhamento…");
    setError(undefined);
    try {
      const resources = await prepareResourcesForSharing(inventoryId);
      setPreparedResources(resources);
      setMessage("Tudo pronto. Escolha PDF, Excel ou Word para compartilhar pelo celular.");
    } catch (cause) {
      setError(reportErrorMessage(cause, "Não foi possível preparar os arquivos para compartilhamento."));
    } finally {
      setPreparingShare(false);
    }
  }

  function shareAction(format: ShareableReportFormat): void {
    const resource = preparedResources[format];
    if (!resource) {
      setError("Aguarde a preparação antes de compartilhar.");
      return;
    }

    setBusy(`share-${format}`);
    setMessage(undefined);
    setError(undefined);

    void sharePreparedResource(resource, format)
      .then((result) => {
        if (result === "shared") setMessage(`Inventário compartilhado em ${formatLabel[format]}.`);
        else if (result === "cancelled") setMessage("Compartilhamento cancelado.");
        else setError("O compartilhamento nativo não está disponível neste navegador.");
      })
      .catch((cause) => setError(reportErrorMessage(cause, "Não foi possível abrir o compartilhamento nativo.")))
      .finally(() => setBusy(undefined));
  }

  const shareReady = Boolean(preparedResources.pdf && preparedResources.xlsx && preparedResources.docx);
  const conferenceLots = report?.lots.filter(requiresConference) ?? [];
  const lotsOk = report?.summary.lotsOk ?? report?.summary.regularLots ?? 0;
  const lotsForConference = report?.summary.lotsForConference ?? report?.summary.fragmentedLots ?? conferenceLots.length;
  const singlePieceOutsideLots = report?.summary.singlePieceOutsideLots ?? report?.summary.loosePieces ?? 0;
  const multiplePiecesOutsideLots = report?.summary.multiplePiecesOutsideLots ?? report?.summary.displacedGroups ?? 0;
  const distributedLots = report?.summary.distributedLots ?? report?.summary.ambiguousDistributions ?? 0;

  return <main className="shell app-page-shell">
    <AppRail active="history" />
    <div className="app-page-content">
    <header className="page-topbar"><Link className="back-link" href="/historico">‹ Voltar ao histórico</Link><div><p className="eyebrow">Relatório oficial</p><h1>{report ? `Inventário ${formatBrazilianDate(report.inventoryDate)}` : "Abrindo inventário…"}</h1><p className="muted">Modo somente leitura. O snapshot final permanece preservado.</p></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!report && !error ? <p className="muted">Carregando relatório central…</p> : null}
    {report ? <div className="stack">
      <section className="metric-grid" aria-label="Resumo final">
        <div className="metric-card metric-card--records"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="file" size={18} /></span><span className="metric-card-kicker">Coleta</span></div><div className="metric-card-copy"><span className="metric-label">Registros</span><span className="metric-value">{report.totalRecords}</span></div></div>
        <div className="metric-card metric-card--pieces"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="chart" size={18} /></span><span className="metric-card-kicker">Volume</span></div><div className="metric-card-copy"><span className="metric-label">Peças lançadas</span><span className="metric-value">{report.totalPieces}</span></div></div>
        <div className="metric-card metric-card--lots"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="boxes" size={18} /></span><span className="metric-card-kicker">Rastreio</span></div><div className="metric-card-copy"><span className="metric-label">Lotes</span><span className="metric-value">{report.summary.lotsAnalyzed}</span></div></div>
        <div className="metric-card metric-card--status"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="check" size={18} /></span><span className="metric-card-kicker">Cobertura</span></div><div className="metric-card-copy"><span className="metric-label">Vãos identificados</span><span className="metric-value">{new Set(report.records.map((record) => `${record.side}-${record.bay}`)).size}</span></div></div>
      </section>

      <section className="card section-card stack" aria-label="Situação dos lotes">
        <div><p className="eyebrow">Conferência</p><h2>Resumo dos lotes</h2><p className="muted">Acompanhe quais lotes estão corretos e quais precisam ser conferidos fisicamente.</p></div>
        <div className="report-summary-grid">
          <div className="report-summary-item good"><span>Lotes OK</span><strong>{lotsOk}</strong></div>
          <div className="report-summary-item attention"><span>Lotes para conferência</span><strong>{lotsForConference}</strong></div>
          <div className="report-summary-item warning"><span>1 peça fora do local principal</span><strong>{singlePieceOutsideLots}</strong></div>
          <div className="report-summary-item alert"><span>Lotes com múltiplas peças fora do local principal</span><strong>{multiplePiecesOutsideLots}</strong></div>
          <div className="report-summary-item critical"><span>Lotes distribuídos em mais de um local</span><strong>{distributedLots}</strong></div>
        </div>
      </section>

      <section className="card section-card stack">
        <div><p className="eyebrow">Arquivos</p><h2>Compartilhar ou baixar</h2><p className="muted">Escolha o formato do inventário. No celular, o compartilhamento abre os aplicativos disponíveis no aparelho.</p></div>

        <button className="primary" disabled={Boolean(busy) || preparingShare} aria-expanded={shareOpen} aria-busy={preparingShare} onClick={() => void toggleShare()}>{preparingShare ? "Preparando compartilhamento…" : "Compartilhar inventário"}</button>

        {shareOpen ? <div className="details-box">
          <div className="details-content stack">
            <div><h3>Escolha o formato</h3><p className="muted">Ao tocar no formato, o menu nativo do celular abre para você escolher o aplicativo de destino.</p></div>
            <div className="export-grid">
              {shareFormats.map((format) => <button className="secondary" disabled={Boolean(busy) || preparingShare || !shareReady} key={format} onClick={() => shareAction(format)}>Compartilhar {formatLabel[format]}</button>)}
            </div>
          </div>
        </div> : null}

        <details className="details-box" open>
          <summary>Exportar Excel</summary>
          <div className="details-content">
            <p className="muted">Excel compatível com o computador da empresa:</p>
            <div className="export-grid">
              {downloadFormats.slice(0, 2).map((format) => <button className="secondary" disabled={Boolean(busy)} key={format} onClick={() => void run(format, async () => { await downloadReport(inventoryId, format); return `${formatLabel[format]} baixado.`; })}>Baixar {formatLabel[format]}</button>)}
            </div>
            <h3>Outros formatos</h3>
            <div className="export-grid">
              {downloadFormats.slice(2).map((format) => <button className="secondary" disabled={Boolean(busy)} key={format} onClick={() => void run(format, async () => { await downloadReport(inventoryId, format); return `${formatLabel[format]} baixado.`; })}>Baixar {formatLabel[format]}</button>)}
            </div>
          </div>
        </details>

        {message ? <p className="notice" role="status">{message}</p> : null}
      </section>

      <section className="card section-card stack" aria-label="Lotes consolidados">
        <div><p className="eyebrow">Conferência</p><h2>Lotes consolidados</h2><p className="muted">Cada lote aparece uma única vez, com o total de peças e os locais encontrados.</p></div>
        <div className="report-table-wrap consolidated-table-wrap">
          <table className="report-table">
            <thead><tr><th>Lote</th><th>Total de peças</th><th>Localização</th><th>Situação</th></tr></thead>
            <tbody>{report.lots.map((lot) => <tr key={lot.lot}>
              <td>{lot.lot}</td>
              <td>{lot.totalQuantity}</td>
              <td className="report-table-locations"><LotLocations locations={lot.locations} classification={lot.classification} presentation={lot.presentation} /></td>
              <td><span className={`classification-tag ${presentationTone(lot)}`}>{visibleSituation(lot)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="consolidated-lot-list">
          {report.lots.map((lot) => (
            <li className="consolidated-lot-card" key={lot.lot}>
              <dl className="consolidated-lot-fields">
                <div><dt>Lote</dt><dd className="consolidated-lot-number">{lot.lot}</dd></div>
                <div><dt>Total de peças</dt><dd className="consolidated-lot-quantity">{lot.totalQuantity}</dd></div>
                <div><dt>Localização</dt><dd><LotLocations locations={lot.locations} classification={lot.classification} presentation={lot.presentation} /></dd></div>
                <div><dt>Situação</dt><dd><span className={`classification-tag ${presentationTone(lot)}`}>{visibleSituation(lot)}</span></dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="card section-card stack" aria-label="Lotes para conferência">
        <div><p className="eyebrow">Ação necessária</p><h2>Lotes para conferência</h2><p className="muted">Somente os lotes que precisam de verificação física aparecem nesta lista.</p></div>
        {conferenceLots.length === 0 ? <p className="empty-state">Nenhum lote precisa de conferência.</p> : <div className="report-table-wrap conference-table-wrap">
          <table className="report-table conference-table">
            <thead><tr><th>Lote</th><th>Total</th><th>Situação</th><th>Local principal</th><th>Outros locais</th><th>Peças fora</th><th>Ação recomendada</th></tr></thead>
            <tbody>{conferenceLots.map((lot) => {
              const presentation: LotPresentation | undefined = lot.presentation;
              return <tr key={lot.lot}>
                <td>{lot.lot}</td>
                <td>{lot.totalQuantity}</td>
                <td><span className={`classification-tag ${presentationTone(lot)}`}>{visibleSituation(lot)}</span></td>
                <td>{presentation?.primaryLocation?.display ?? "Não definido"}</td>
                <td className="conference-locations">{presentation?.otherLocations?.length ? presentation.otherLocations.map((location) => <span key={location.display}>{location.display}</span>) : "—"}</td>
                <td>{presentation?.outOfPrimaryQuantity ?? "Não aplicável"}</td>
                <td>{presentation?.action ?? "Conferir fisicamente o lote."}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </section>
    </div> : null}
    </div>
  </main>;
}
