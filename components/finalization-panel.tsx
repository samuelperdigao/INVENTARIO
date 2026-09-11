"use client";

import { useState } from "react";

import { getAuthenticatedContext } from "@/lib/auth-client";
import { markInventoryFinished } from "@/lib/inventory-repository";
import { syncInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

export function FinalizationPanel({ inventory, onFinished }: { inventory: Inventory; onFinished: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

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

  async function download(format: "xlsx" | "pdf" | "docx"): Promise<void> {
    setBusy(true); setMessage(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/inventories/${inventory.id}/exports/${format}`, { credentials: "include", headers: await headers() });
      if (!response.ok) throw new Error("Não foi possível gerar a exportação.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `Inventario.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível gerar a exportação."); }
    finally { setBusy(false); }
  }

  return <section className="card stack" aria-label="Finalização e exportações">
    <div className="topbar"><div><h2>Finalização e relatórios</h2><p className="muted">As exportações são geradas pelo relatório consolidado central.</p></div>{inventory.status === "OPEN" ? <button className="primary" type="button" disabled={busy} onClick={() => void finish()}>{busy ? "Processando…" : "Finalizar inventário"}</button> : <span className="notice">Finalizado</span>}</div>
    {inventory.status === "FINISHED" ? <div className="entry-actions"><button className="secondary" type="button" disabled={busy} onClick={() => void download("xlsx")}>Excel</button><button className="secondary" type="button" disabled={busy} onClick={() => void download("pdf")}>PDF</button><button className="secondary" type="button" disabled={busy} onClick={() => void download("docx")}>Word</button></div> : <p className="muted">Sincronize e finalize para congelar o relatório e liberar as exportações.</p>}
    {message ? <p className={message.startsWith("Inventário") ? "notice" : "error"} role="status">{message}</p> : null}
  </section>;
}
