"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AnalysisPanel } from "@/components/analysis-panel";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { formatBrazilianDate } from "@/lib/local-date";
import { createEntry, getInventory, listActiveEntries, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import type { EntryDraft, Inventory, InventoryEntry } from "@/lib/models";
import { SyncPanel } from "@/components/sync-panel";

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
      <div className="topbar"><div><Link className="muted" href="/">← Inventários</Link><h1>Inventário {formatBrazilianDate(inventory.date)}</h1></div><span className="muted">{inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Local"}</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="stack">
        <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => setEditing(undefined)} />
        <EntryList entries={entries} onEdit={setEditing} onDelete={(entry) => void deleteEntry(entry)} />
        <SyncPanel inventory={inventory} onSynced={refresh} />
        <AnalysisPanel key={`${inventory.id}:${inventory.revision}`} inventory={inventory} entries={entries} />
      </div>
    </main>
  );
}
