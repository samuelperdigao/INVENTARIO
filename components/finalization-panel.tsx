"use client";

import { useState } from "react";

import { apiBaseUrl } from "@/lib/api-config";
import { getAuthenticatedContext } from "@/lib/auth-client";
import { markInventoryFinished } from "@/lib/inventory-repository";
import { syncInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";
import {
  downloadReport,
  prepareResourcesForSharing,
  reportErrorMessage,
  sharePreparedResource,
  type PreparedShareResources,
  type ReportFormat,
} from "@/lib/report-client";

const formats: ReportFormat[] = ["pdf", "xlsx", "docx"];
const formatLabel: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  docx: "Word",
};

export function FinalizationPanel({ inventory, onFinished }: { inventory: Inventory; onFinished: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  const [preparedResources, setPreparedResources] = useState<PreparedShareResources>({});

  async function headers(): Promise<Record<string, string>> {
    const auth = await getAuthenticatedContext();
    return { Authorization: `Bearer ${auth.accessToken}`, "X-Inventory-Sync-Token": inventory.syncToken, "Content-Type": "application/json" };
  }

  async function finish(): Promise<void> {
    if (!window.confirm("Finalizar este inventário? Os lançamentos permanecerão preservados e não poderão ser alterados sem uma regra de reabertura aprovada.")) return;
    setBusy(true); setMessage(undefined);
    try {
      await syncInventory(inventory.id);
      const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/finalize`, { method: "POST", credentials: "include", headers: await headers(), body: JSON.stringify({ revision: inventory.revision }) });
      const body = await response.json().catch(() => undefined) as { detail?: string; revision?: number } | undefined;
      if (!response.ok || !body?.revision) throw new Error(body?.detail ?? "Não foi possível finalizar o inventário.");
      await markInventoryFinished(inventory.id, body.revision);
      await onFinished();
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

  function shareAction(format: ReportFormat): void {
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

  return <section className="card section-card panel-card stack" aria-label="Finalização e exportações">
    <div className="section-header">
      <div className="panel-heading">
        <span className="panel-index" aria-hidden="true">05</span>
        <div className="panel-copy">
          <p className="eyebrow">Encerramento</p>
          <h2>Finalização e relatórios</h2>
          <p className="muted">Ao finalizar, o relatório consolidado é congelado no servidor e o inventário passa para somente leitura.</p>
        </div>
      </div>
      {inventory.status === "OPEN" ? <button className="primary" type="button" disabled={busy} onClick={() => void finish()}>{busy ? "Processando…" : "Finalizar inventário"}</button> : <span className="micro-pill good">Finalizado</span>}
    </div>

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
            {formats.map((format) => <button
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

      <details className="details-box">
        <summary>Baixar arquivo</summary>
        <div className="details-content">
          <div className="export-grid">
            {formats.map((format) => <button
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
  </section>;
}
