"use client";

import { useEffect, useState } from "react";

import { listSyncConflicts, resolveConflict, syncInventory } from "@/lib/sync-client";
import type { Inventory, SyncConflict } from "@/lib/models";

function conflictLabel(conflict: SyncConflict): string {
  if (conflict.entityType === "inventory") return "metadados do inventário";
  const record = conflict.localRecord;
  return "lot" in record ? `registro do lote ${record.lot}` : "registro";
}

interface SyncPanelProps {
  inventory: Inventory;
  onSynced: () => Promise<void>;
  embedded?: boolean;
}

export function SyncPanel({ inventory, onSynced, embedded = false }: SyncPanelProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [copied, setCopied] = useState(false);

  async function refreshConflicts(): Promise<void> {
    setConflicts(await listSyncConflicts(inventory.id));
  }

  useEffect(() => {
    let active = true;
    void listSyncConflicts(inventory.id).then((items) => { if (active) setConflicts(items); });
    return () => { active = false; };
  }, [inventory.id, inventory.revision, inventory.syncStatus]);

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

  async function copyCode(): Promise<void> {
    if (!inventory.participationCode) return;
    try {
      await navigator.clipboard.writeText(inventory.participationCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione os seis números exibidos.");
    }
  }

  return (
    <section className={embedded ? "control-stage-content stack" : "card section-card panel-card stack"} aria-label="Sincronização">
      {!embedded ? <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">03</span>
          <div className="panel-copy">
            <p className="eyebrow">Sincronização</p>
            <h2>Sincronização</h2>
            <p className="muted">{inventory.syncStatus === "SYNCED" ? "Os lançamentos deste dispositivo estão em dia." : "Há lançamentos locais aguardando envio."}</p>
          </div>
        </div>
        <span className={`micro-pill ${inventory.syncStatus === "SYNCED" ? "good" : ""}`}>{inventory.syncStatus === "SYNCED" ? "Em dia" : "Pendente"}</span>
      </div> : <p className="muted">Envie os lançamentos preservados neste dispositivo quando houver conexão.</p>}

      <button className="secondary" type="button" onClick={() => void handleSync()} disabled={loading} aria-busy={loading}>{loading ? "Sincronizando…" : "Sincronizar agora"}</button>
      {message ? <p className={message.startsWith("Sincronização") ? "notice" : "error"} role="status">{message}</p> : null}

      {inventory.status === "OPEN" ? <div className="participation-box">
        <div><p className="eyebrow">Código de participação</p><strong className="participation-code">{inventory.participationCode ?? "Sincronize para gerar"}</strong><p className="muted">Compartilhe apenas o código de 6 números.</p></div>
        {inventory.participationCode ? <button className="secondary" type="button" onClick={() => void copyCode()}>{copied ? "Copiado" : "Copiar código"}</button> : null}
      </div> : null}

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
