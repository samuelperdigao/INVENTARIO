"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AnalysisPanel } from "@/components/analysis-panel";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { formatBrazilianDate } from "@/lib/local-date";
import { createEntry, getInventory, listActiveEntries, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import type { EntryDraft, Inventory, InventoryEntry } from "@/lib/models";
import { SyncPanel } from "@/components/sync-panel";
import { FinalizationPanel } from "@/components/finalization-panel";

export function InventoryScreen({ inventoryId }: { inventoryId: string }) {
  const [inventory, setInventory] = useState<Inventory>();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [editing, setEditing] = useState<InventoryEntry>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [currentInventory, currentEntries] = await Promise.all([getInventory(inventoryId), listActiveEntries(inventoryId)]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    setInventory(currentInventory);
    setEntries(currentEntries);
  }, [inventoryId]);

  useEffect(() => {
    let active = true;
    void Promise.all([getInventory(inventoryId), listActiveEntries(inventoryId)])
      .then(([currentInventory, currentEntries]) => {
        if (!active) return;
        if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
        setInventory(currentInventory);
        setEntries(currentEntries);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o inventário.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inventoryId]);

  const totalPieces = useMemo(() => entries.reduce((sum, entry) => sum + entry.quantity, 0), [entries]);
  const distinctLots = useMemo(() => new Set(entries.map((entry) => entry.lot.trim())).size, [entries]);

  async function saveEntry(draft: EntryDraft, entryId?: string): Promise<void> {
    setError(undefined);
    if (entryId) await updateEntry(entryId, draft);
    else await createEntry(inventoryId, draft);
    await refresh();
    setEditing(undefined);
  }

  async function deleteEntry(entry: InventoryEntry): Promise<void> {
    const confirmed = window.confirm(`Excluir o lote ${entry.lot} em ${entry.side}, vão ${entry.bay}, com ${entry.quantity} peça(s)?`);
    if (!confirmed) return;
    try {
      await tombstoneEntry(entry.id);
      if (editing?.id === entry.id) setEditing(undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? `Registro não excluído. ${cause.message}` : "Registro não excluído.");
    }
  }

  if (loading) return <main className="shell"><p className="muted">Abrindo inventário local…</p></main>;
  if (!inventory) return <main className="shell"><p className="error" role="alert">{error ?? "Inventário não encontrado."}</p><Link className="secondary" href="/">Voltar</Link></main>;

  return (
    <main className="shell">
      <header className="inventory-header">
        <div className="inventory-header-row">
          <div className="inventory-header-copy">
            <Link className="back-link" href="/">‹ Inventários</Link>
            <p className="eyebrow">Inventário em operação</p>
            <h1>Inventário {formatBrazilianDate(inventory.date)}</h1>
            <p className="muted">Registre cada ocorrência individualmente. A consolidação acontece somente na análise e no relatório final.</p>
          </div>
          <span className="status-pill">{inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumo do inventário">
        <div className="metric-card"><span className="metric-label">Registros</span><span className="metric-value">{entries.length}</span></div>
        <div className="metric-card"><span className="metric-label">Lotes</span><span className="metric-value">{distinctLots}</span></div>
        <div className="metric-card"><span className="metric-label">Peças lançadas</span><span className="metric-value">{totalPieces}</span></div>
        <div className="metric-card"><span className="metric-label">Situação</span><span className="metric-value">{inventory.status === "FINISHED" ? "Finalizado" : "Em andamento"}</span></div>
      </section>

      <nav className="workflow-strip" aria-label="Fluxo operacional do inventário">
        <div className="workflow-step"><span className="workflow-number">01</span><span>Lançar</span></div>
        <div className="workflow-step"><span className="workflow-number">02</span><span>Conferir</span></div>
        <div className="workflow-step"><span className="workflow-number">03</span><span>Sincronizar</span></div>
        <div className="workflow-step"><span className="workflow-number">04</span><span>Analisar</span></div>
        <div className="workflow-step"><span className="workflow-number">05</span><span>Finalizar</span></div>
      </nav>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="stack">
        {inventory.status === "OPEN" ? <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => setEditing(undefined)} /> : <p className="notice">Inventário finalizado: lançamentos preservados em modo somente leitura.</p>}
        <EntryList entries={entries} onEdit={setEditing} onDelete={(entry) => void deleteEntry(entry)} readOnly={inventory.status === "FINISHED"} />
        <SyncPanel inventory={inventory} onSynced={refresh} />
        <AnalysisPanel key={`${inventory.id}:${inventory.revision}`} inventory={inventory} entries={entries} />
        <FinalizationPanel inventory={inventory} onFinished={refresh} />
      </div>
    </main>
  );
}
