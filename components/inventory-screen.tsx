"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AnalysisPanel } from "@/components/analysis-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { FinalizationPanel } from "@/components/finalization-panel";
import { SyncPanel } from "@/components/sync-panel";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { getCurrentUser } from "@/lib/auth-client";
import { findRemoteDuplicateLotEntries } from "@/lib/duplicate-client";
import { formatBrazilianDate } from "@/lib/local-date";
import { createEntry, DuplicateLotError, findDuplicateLotEntries, getInventory, listActiveEntries, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import type { EntryDraft, Inventory, InventoryEntry } from "@/lib/models";

export function InventoryScreen({ inventoryId }: { inventoryId: string }) {
  const [inventory, setInventory] = useState<Inventory>();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [editing, setEditing] = useState<InventoryEntry>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pendingDeletion, setPendingDeletion] = useState<InventoryEntry>();
  const [deleting, setDeleting] = useState(false);

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

  async function saveEntry(draft: EntryDraft, entryId?: string, allowDuplicate = false): Promise<void> {
    setError(undefined);
    const currentInventory = inventory ?? await getInventory(inventoryId);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");

    if (!allowDuplicate) {
      const localDuplicates = await findDuplicateLotEntries(inventoryId, draft.lot, entryId);
      if (localDuplicates.length > 0) throw new DuplicateLotError(localDuplicates);
      const remoteDuplicates = await findRemoteDuplicateLotEntries(currentInventory, draft.lot, entryId);
      if (remoteDuplicates.length > 0) throw new DuplicateLotError(remoteDuplicates);
    }

    const user = getCurrentUser();
    if (entryId) {
      await updateEntry(entryId, draft, { allowDuplicate });
    } else {
      await createEntry(inventoryId, draft, {
        allowDuplicate,
        createdByUserId: user?.id,
        createdByName: user?.displayName,
      });
    }
    await refresh();
    setEditing(undefined);
  }

  async function deleteEntry(): Promise<void> {
    if (!pendingDeletion) return;
    setDeleting(true);
    try {
      await tombstoneEntry(pendingDeletion.id);
      if (editing?.id === pendingDeletion.id) setEditing(undefined);
      await refresh();
      setPendingDeletion(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? `Registro não excluído. ${cause.message}` : "Registro não excluído.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <main className="shell"><p className="muted">Abrindo inventário local…</p></main>;
  if (!inventory) return <main className="shell"><p className="error" role="alert">{error ?? "Inventário não encontrado."}</p><Link className="secondary" href="/dashboard">Voltar</Link></main>;

  return (
    <main className="shell inventory-shell">
      <aside className="inventory-rail" aria-label="Etapas do inventário">
        <Link className="brand-link" href="/dashboard" aria-label="INVENTÁRIO, painel"><BrandLogo compact subtitle="Beam Blanks e Blocos" /></Link>
        <p className="inventory-rail-label">Inventário #{inventory.id.slice(-6)}</p>
        <nav className="inventory-rail-steps">
          <span className="inventory-rail-step active"><b>01</b><span><strong>Lançar</strong><small>Registrar itens</small></span></span>
          <span className="inventory-rail-step"><b>02</b><span><strong>Conferir</strong><small>Revisar registros</small></span></span>
          <span className="inventory-rail-step"><b>03</b><span><strong>Sincronizar</strong><small>Enviar dados</small></span></span>
          <span className="inventory-rail-step"><b>04</b><span><strong>Analisar</strong><small>Ver lotes para conferência</small></span></span>
          <span className="inventory-rail-step"><b>05</b><span><strong>Finalizar</strong><small>Gerar relatório</small></span></span>
        </nav>
        <p className="inventory-rail-foot"><Icon name="cloud" size={14} /> Salvo localmente</p>
      </aside>
      <div className="inventory-content">
      <header className="inventory-header">
        <div className="inventory-header-row">
          <div className="inventory-header-copy">
            <Link className="back-link" href="/dashboard">‹ Painel</Link>
            <p className="eyebrow">Inventário em operação</p>
            <h1>Inventário {formatBrazilianDate(inventory.date)}</h1>
            <p className="muted">Inventário de Beam Blanks e Blocos. Cada ocorrência é preservada individualmente para análise e relatório final.</p>
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
        <div className="entry-workspace">
          {inventory.status === "OPEN" ? <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => setEditing(undefined)} /> : <p className="notice">Inventário finalizado: lançamentos preservados em modo somente leitura.</p>}
          <EntryList entries={entries} onEdit={setEditing} onDelete={setPendingDeletion} readOnly={inventory.status === "FINISHED"} />
        </div>
        <div className="support-workspace">
          <SyncPanel inventory={inventory} onSynced={refresh} />
          <AnalysisPanel key={`${inventory.id}:${inventory.revision}`} inventory={inventory} entries={entries} />
          <FinalizationPanel inventory={inventory} onFinished={refresh} />
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        variant="danger"
        title="Excluir lançamento?"
        description={pendingDeletion ? `O lote ${pendingDeletion.lot}, no lado ${pendingDeletion.side}, vão ${pendingDeletion.bay}${pendingDeletion.layer ? `, camada ${pendingDeletion.layer}` : ""}, com ${pendingDeletion.quantity} peça(s), será removido da lista e preservado para sincronização.` : ""}
        confirmLabel="Excluir lançamento"
        busyLabel="Excluindo…"
        busy={deleting}
        onConfirm={() => void deleteEntry()}
        onClose={() => setPendingDeletion(undefined)}
      />
      </div>
    </main>
  );
}
