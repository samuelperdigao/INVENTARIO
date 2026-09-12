"use client";

import { useEffect, useState } from "react";

import { listSyncConflicts, resolveConflict, syncInventory } from "@/lib/sync-client";
import type { Inventory, SyncConflict } from "@/lib/models";

function conflictLabel(conflict: SyncConflict): string {
  if (conflict.entityType === "inventory") return "metadados do inventário";
  const record = conflict.localRecord;
  return "lot" in record ? `registro do lote ${record.lot}` : "registro";
}

export function SyncPanel({ inventory, onSynced }: { inventory: Inventory; onSynced: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  async function refreshConflicts(): Promise<void> {
    setConflicts(await listSyncConflicts(inventory.id));
  }

  useEffect(() => {
    let active = true;
    void listSyncConflicts(inventory.id).then((items) => { if (active) setConflicts(items); });
    return () => { active = false; };
  }, [inventory.id]);

  async function handleSync(): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMessage("Offline: os lançamentos continuam salvos neste dispositivo e serão sincronizados quando houver conexão.");
      return;
    }
    setLoading(true);
    setMessage(undefined);
    try {
      const result = await syncInventory(inventory.id);
      await onSynced();
      await refreshConflicts();
      setMessage(result.conflicts > 0
        ? "Foram encontrados conflitos. Nenhum lançamento foi apagado; escolha qual versão manter abaixo."
        : "Sincronização concluída.");
    } catch (cause) {
      await onSynced();
      setMessage(cause instanceof Error ? cause.message : "Não foi possível sincronizar agora. Os dados locais continuam preservados.");
    } finally {
      setLoading(false);
    }
  }

  async function choose(conflict: SyncConflict, choice: "local" | "server"): Promise<void> {
    await resolveConflict(inventory.id, conflict.id, choice);
    await onSynced();
    await refreshConflicts();
    setMessage(choice === "local" ? "Sua versão será enviada na próxima sincronização." : "A versão central foi aplicada neste dispositivo.");
  }

  return (
    <section className="card section-card panel-card stack" aria-label="Sincronização">
      <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">03</span>
          <div className="panel-copy">
            <p className="eyebrow">Proteção central</p>
            <h2>Sincronização</h2>
            <p className="muted">{inventory.syncStatus === "SYNCED" ? "Todos os dados locais conhecidos estão sincronizados." : "Há alterações locais pendentes de envio ao servidor."}</p>
          </div>
        </div>
        <span className={`micro-pill ${inventory.syncStatus === "SYNCED" ? "good" : ""}`}>{inventory.syncStatus === "SYNCED" ? "Em dia" : "Pendente"}</span>
      </div>

      <button className="secondary" type="button" onClick={() => void handleSync()} disabled={loading}>{loading ? "Sincronizando…" : "Sincronizar agora"}</button>
      {message ? <p className={message.startsWith("Sincronização") ? "notice" : "error"} role="status">{message}</p> : null}

      {inventory.syncToken ? <details className="details-box">
        <summary>Conectar este inventário em outro dispositivo</summary>
        <div className="details-content">
          <p className="muted">No outro dispositivo, informe estes dois valores na tela inicial. Trate o código como uma senha.</p>
          <p><strong>ID:</strong> <code>{inventory.id}</code><br /><strong>Código:</strong> <code>{inventory.syncToken}</code></p>
        </div>
      </details> : null}

      {conflicts.length > 0 ? <div className="stack" aria-label="Conflitos de sincronização">
        <p className="error">{conflicts.length} conflito(s) aguardando decisão. Os dois dados foram preservados.</p>
        {conflicts.map((conflict) => <div className="notice" key={conflict.id}>
          <p>Conflito em {conflictLabel(conflict)}.</p>
          <div className="actions"><button className="secondary" type="button" onClick={() => void choose(conflict, "local")}>Manter minha versão</button><button className="secondary" type="button" onClick={() => void choose(conflict, "server")}>Usar versão central</button></div>
        </div>)}
      </div> : null}
    </section>
  );
}
