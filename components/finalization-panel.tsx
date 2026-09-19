"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedContext } from "@/lib/auth-client";
import { getInventory, markInventoryFinished } from "@/lib/inventory-repository";
import { syncInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";
import {
  downloadReport,
  prepareResourcesForSharing,
  reportErrorMessage,
  sharePreparedResource,
  type PreparedShareResources,
  type ReportFormat,
  type ShareableReportFormat,
} from "@/lib/report-client";

const shareFormats: ShareableReportFormat[] = ["pdf", "xlsx", "docx"];
const downloadFormats: ReportFormat[] = ["xls", "xlsx", "pdf", "docx"];
const formatLabel: Record<ReportFormat, string> = {
  xls: "Excel compatível (.xls)",
  xlsx: "Excel moderno (.xlsx)",
  pdf: "PDF",
  docx: "Word",
};

interface FinalizationPanelProps {
  inventory: Inventory;
  onFinished: () => Promise<void>;
  embedded?: boolean;
  readyForFinalization?: boolean;
  emptyInventory?: boolean;
}

export function FinalizationPanel({ inventory, onFinished, embedded = false, readyForFinalization = false, emptyInventory = false }: FinalizationPanelProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  const [preparedResources, setPreparedResources] = useState<PreparedShareResources>({});
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  async function headers(syncToken: string): Promise<Record<string, string>> {
    const auth = await getAuthenticatedContext();
    return { Authorization: `Bearer ${auth.accessToken}`, "X-Inventory-Sync-Token": syncToken, "Content-Type": "application/json" };
  }

  async function finish(): Promise<void> {
    setBusy(true); setMessage(undefined);
    try {
      const syncResult = await syncInventory(inventory.id);
      if (syncResult.serverStatus === "FINISHED") {
        await onFinished();
        throw new Error("Este inventário já foi finalizado em outro dispositivo.");
      }
      if (syncResult.conflicts > 0) throw new Error("Resolva os conflitos de sincronização antes de finalizar.");
      const currentInventory = await getInventory(inventory.id);
      if (!currentInventory || currentInventory.tombstone) throw new Error("Inventário não encontrado neste dispositivo.");
      if (currentInventory.status !== "OPEN") throw new Error("Este inventário já foi finalizado.");
      if (currentInventory.syncStatus !== "SYNCED") throw new Error("Não foi possível confirmar a sincronização antes da finalização.");
      const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${currentInventory.id}/finalize`, { method: "POST", credentials: "include", headers: await headers(currentInventory.syncToken), body: JSON.stringify({ revision: currentInventory.revision }) });
      const body = await response.json().catch(() => undefined) as { detail?: string; revision?: number } | undefined;
      if (!response.ok || !body?.revision) throw new Error(body?.detail ?? "Não foi possível finalizar o inventário.");
      await markInventoryFinished(inventory.id, body.revision);
      await onFinished();
      setConfirmingFinish(false);
      setMessage("Inventário finalizado. O relatório e as exportações estão preservados.");
    } catch (cause) { setMessage(reportErrorMessage(cause, "Não foi possível finalizar o inventário.")); }
    finally { setBusy(false); }
  }

  async function downloadAction(format: ReportFormat): Promise<void> {
    setBusy(true); setMessage(undefined);
    try {
      await downloadReport(inventory.id, format);
      setMessage(`${formatLabel[format]} baixado.`);
    } catch (cause) { setMessage(reportErrorMessage(cause, "Não foi possível gerar a exportação.")); }
    finally { setBusy(false); }
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
    try {
      const resources = await prepareResourcesForSharing(inventory.id);
      setPreparedResources(resources);
      setMessage("Tudo pronto. Escolha PDF, Excel ou Word para compartilhar pelo celular.");
    } catch (cause) {
      setMessage(reportErrorMessage(cause, "Não foi possível preparar os arquivos para compartilhamento."));
    } finally {
      setPreparingShare(false);
    }
  }

  function shareAction(format: ShareableReportFormat): void {
    const resource = preparedResources[format];
    if (!resource) {
      setMessage("Aguarde a preparação antes de compartilhar.");
      return;
    }

    setBusy(true);
    setMessage(undefined);

    void sharePreparedResource(resource, format)
      .then((result) => {
        if (result === "shared") {
          setMessage(`Inventário compartilhado em ${formatLabel[format]}.`);
        } else if (result === "cancelled") {
          setMessage("Compartilhamento cancelado.");
        } else {
          setMessage("O compartilhamento nativo não está disponível neste navegador.");
        }
      })
      .catch((cause) => setMessage(reportErrorMessage(cause, "Não foi possível abrir o compartilhamento nativo.")))
      .finally(() => setBusy(false));
  }

  const shareReady = Boolean(preparedResources.pdf && preparedResources.xlsx && preparedResources.docx);
  const finishReady = embedded ? readyForFinalization : true;

  return <>
    <section className={embedded ? "control-stage-content stack" : "card section-card panel-card stack"} aria-label="Finalização e exportações">
    {!embedded ? <div className="section-header">
      <div className="panel-heading">
        <span className="panel-index" aria-hidden="true">05</span>
        <div className="panel-copy">
          <p className="eyebrow">Encerramento</p>
          <h2>Finalização e relatórios</h2>
          <p className="muted">Ao finalizar, o relatório oficial fica preservado e o inventário entra em somente leitura.</p>
        </div>
      </div>
      {inventory.status === "OPEN" ? <button className={finishReady ? "primary" : "secondary"} type="button" disabled={busy} aria-busy={busy} data-finalization-ready={finishReady} onClick={() => setConfirmingFinish(true)}>{busy ? "Processando…" : "Finalizar inventário"}</button> : <span className="micro-pill good">Finalizado</span>}
    </div> : <div className="control-stage-action">{inventory.status === "OPEN" ? <button className={finishReady ? "primary" : "secondary"} type="button" disabled={busy} aria-busy={busy} data-finalization-ready={finishReady} onClick={() => setConfirmingFinish(true)}>{busy ? "Processando…" : "Finalizar inventário"}</button> : <span className="micro-pill good">Finalizado</span>}</div>}

    {inventory.status === "FINISHED" ? <div className="stack">
      <button
        className="primary"
        type="button"
        disabled={busy || preparingShare}
        aria-expanded={shareOpen}
        aria-busy={preparingShare}
        onClick={() => void toggleShare()}
      >
        {preparingShare ? "Preparando compartilhamento…" : "Compartilhar inventário"}
      </button>

      {shareOpen ? <div className="details-box">
        <div className="details-content stack">
          <div>
            <h3>Escolha o formato</h3>
            <p className="muted">Ao tocar no formato, o menu nativo do celular abre para você escolher o aplicativo de destino.</p>
          </div>
          <div className="export-grid">
            {shareFormats.map((format) => <button
              className="secondary"
              type="button"
              disabled={busy || preparingShare || !shareReady}
              key={format}
              onClick={() => shareAction(format)}
            >
              Compartilhar {formatLabel[format]}
            </button>)}
          </div>
        </div>
      </div> : null}

      <details className="details-box" open>
        <summary>Exportar Excel</summary>
        <div className="details-content">
          <p className="muted">Excel compatível com o computador da empresa:</p>
          <div className="export-grid">
            {downloadFormats.slice(0, 2).map((format) => <button
              className="secondary"
              type="button"
              disabled={busy}
              key={format}
              onClick={() => void downloadAction(format)}
            >
              Baixar {formatLabel[format]}
            </button>)}
          </div>
          <h3>Outros formatos</h3>
          <div className="export-grid">
            {downloadFormats.slice(2).map((format) => <button
              className="secondary"
              type="button"
              disabled={busy}
              key={format}
              onClick={() => void downloadAction(format)}
            >
              Baixar {formatLabel[format]}
            </button>)}
          </div>
        </div>
      </details>
    </div> : <p className="notice">Antes de finalizar, confira os lançamentos, sincronize e atualize a análise para reduzir retrabalho.</p>}

    {message ? <p className={message.startsWith("Inventário") || message.endsWith("baixado.") || message === "Compartilhamento cancelado." || message.startsWith("Preparando") || message.startsWith("Tudo pronto") ? "notice" : "error"} role="status">{message}</p> : null}
    </section>
    <ConfirmDialog
      open={confirmingFinish}
      title="Finalizar inventário?"
      description={emptyInventory
        ? "Este inventário está vazio. O aplicativo vai sincronizar e gerar um relatório oficial sem lançamentos. Depois disso, o inventário ficará somente para leitura."
        : "Ao finalizar, os lançamentos permanecerão preservados e não poderão ser alterados sem uma regra de reabertura aprovada."}
      confirmLabel="Finalizar inventário"
      busyLabel="Finalizando…"
      busy={busy}
      onConfirm={() => void finish()}
      onClose={() => setConfirmingFinish(false)}
    />
  </>;
}
