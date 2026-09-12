"use client";

import { useState } from "react";

import { getAuthenticatedContext } from "@/lib/auth-client";
import { markInventoryFinished } from "@/lib/inventory-repository";
import { syncInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";
import { downloadReport, shareReport, type ReportFormat } from "@/lib/report-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

const formatLabel: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  docx: "Word",
};

export function FinalizationPanel({ inventory, onFinished }: { inventory: Inventory; onFinished: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);

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
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível finalizar o inventário."); }
    finally { setBusy(false); }
  }

  async function downloadAction(format: ReportFormat): Promise<void> {
    setBusy(true); setMessage(undefined);
    try {
      await downloadReport(inventory.id, format);
      setMessage(`${formatLabel[format]} baixado.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível gerar a exportação."); }
    finally { setBusy(false); }
  }

  async function shareAction(format: ReportFormat): Promise<void> {
    setBusy(true); setMessage(undefined);
    try {
      const result = await shareReport(inventory.id, format);
      setMessage(result === "shared"
        ? `Inventário compartilhado em ${formatLabel[format]}.`
        : `Compartilhamento nativo indisponível; o arquivo ${formatLabel[format]} foi baixado.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível compartilhar o inventário."); }
    finally { setBusy(false); }
  }

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
        disabled={busy}
        aria-expanded={shareOpen}
        onClick={() => setShareOpen((current) => !current)}
      >
        Compartilhar inventário
      </button>

      {shareOpen ? <div className="details-box">
        <div className="details-content stack">
          <div>
            <h3>Escolha o formato</h3>
            <p className="muted">No celular, o sistema abre os aplicativos disponíveis para compartilhar o arquivo escolhido.</p>
          </div>
          <div className="export-grid">
            {(["pdf", "xlsx", "docx"] as ReportFormat[]).map((format) => <button
              className="secondary"
              type="button"
              disabled={busy}
              key={format}
              onClick={() => void shareAction(format)}
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
            {(["pdf", "xlsx", "docx"] as ReportFormat[]).map((format) => <button
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

    {message ? <p className={message.startsWith("Inventário") || message.endsWith("baixado.") ? "notice" : "error"} role="status">{message}</p> : null}
  </section>;
}
