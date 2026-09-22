"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { InventoryControlPanel } from "@/components/inventory-control-panel";
import { ReferencePanel, createReferenceLotChecker } from "@/components/reference-panel";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { getCurrentUser } from "@/lib/auth-client";
import { findRemoteDuplicateLotEntries } from "@/lib/duplicate-client";
import { formatBrazilianDate } from "@/lib/local-date";
import { createEntry, DuplicateLotError, findDuplicateLotEntries, getInventory, listActiveEntries, purgeInventory, restoreInventoryAfterDeletionFailure, tombstoneEmptyInventory, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import { formatSideLabel, type EntryDraft, type Inventory, type InventoryEntry } from "@/lib/models";
import { INVENTORY_POLLING_INTERVAL_MS, SyncHttpError, syncInventory } from "@/lib/sync-client";

function inventoryScreenKey(value?: Inventory): string {
  if (!value) return "";
  return JSON.stringify({
    id: value.id,
    date: value.date,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    revision: value.revision,
    syncBaseRevision: value.syncBaseRevision,
    syncStatus: value.syncStatus,
    participationCode: value.participationCode ?? null,
    tombstone: value.tombstone,
    deletedAt: value.deletedAt ?? null,
  });
}

function entriesScreenKey(value: InventoryEntry[]): string {
  return JSON.stringify(value
    .map((entry) => ({
      id: entry.id,
      inventoryId: entry.inventoryId,
      side: entry.side,
      bay: entry.bay,
      layer: entry.layer ?? null,
      lot: entry.lot,
      quantity: entry.quantity,
      duplicateConfirmed: Boolean(entry.duplicateConfirmed),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
      syncBaseRevision: entry.syncBaseRevision,
      syncStatus: entry.syncStatus,
      tombstone: entry.tombstone,
      deletedAt: entry.deletedAt ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

export function InventoryScreen({ inventoryId }: { inventoryId: string }) {
  const router = useRouter();
  const [inventory, setInventory] = useState<Inventory>();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [editing, setEditing] = useState<InventoryEntry>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pendingDeletion, setPendingDeletion] = useState<InventoryEntry>();
  const [deleting, setDeleting] = useState(false);
  const [confirmingInventoryDeletion, setConfirmingInventoryDeletion] = useState(false);
  const [deletingInventory, setDeletingInventory] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string>();
  const [formDirty, setFormDirty] = useState(false);
  const [remoteFinalized, setRemoteFinalized] = useState(false);
  const latestInventoryRef = useRef<Inventory | undefined>(undefined);
  const latestEntriesRef = useRef<InventoryEntry[]>([]);

  const refresh = useCallback(async () => {
    const [currentInventory, currentEntries] = await Promise.all([getInventory(inventoryId), listActiveEntries(inventoryId)]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    latestInventoryRef.current = currentInventory;
    latestEntriesRef.current = currentEntries;
    setInventory(currentInventory);
    setEntries(currentEntries);
  }, [inventoryId]);

  const refreshIfChanged = useCallback(async () => {
    const previousInventory = latestInventoryRef.current;
    const previousEntries = latestEntriesRef.current;
    const [currentInventory, currentEntries] = await Promise.all([getInventory(inventoryId), listActiveEntries(inventoryId)]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    if (inventoryScreenKey(previousInventory) !== inventoryScreenKey(currentInventory)) setInventory(currentInventory);
    if (entriesScreenKey(previousEntries) !== entriesScreenKey(currentEntries)) setEntries(currentEntries);
    latestInventoryRef.current = currentInventory;
    latestEntriesRef.current = currentEntries;
  }, [inventoryId]);

  useEffect(() => {
    let active = true;
    void Promise.all([getInventory(inventoryId), listActiveEntries(inventoryId)])
      .then(([currentInventory, currentEntries]) => {
        if (!active) return;
        if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
        setFormDirty(false);
        setRemoteFinalized(false);
        latestInventoryRef.current = currentInventory;
        latestEntriesRef.current = currentEntries;
        setInventory(currentInventory);
        setEntries(currentEntries);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o inventário.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inventoryId]);

  const runBackgroundSync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const result = await syncInventory(inventoryId, { background: true });
      if (result.serverStatus === "FINISHED") setRemoteFinalized(true);
      if (result.changed) await refreshIfChanged();
    } catch {
      // Local writes stay available when the network or authentication is unavailable.
    }
  }, [inventoryId, refreshIfChanged]);

  const inventoryStatus = inventory?.status;

  useEffect(() => {
    if (inventoryStatus !== "OPEN" || remoteFinalized) return;
    let active = true;
    let busy = false;
    let lastTriggerAt = 0;

    async function poll(): Promise<void> {
      if (!active || busy || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastTriggerAt < 500) return;
      lastTriggerAt = now;
      busy = true;
      try {
        const result = await syncInventory(inventoryId, { background: true });
        if (!active) return;
        if (result.serverStatus === "FINISHED") setRemoteFinalized(true);
        if (result.changed) await refreshIfChanged();
      } catch {
        // Polling is intentionally silent; manual sync remains available for visible errors.
      } finally {
        busy = false;
      }
    }

    const intervalId = window.setInterval(() => { void poll(); }, INVENTORY_POLLING_INTERVAL_MS);
    const handleVisibility = () => { if (document.visibilityState === "visible") void poll(); };
    const handleOnline = () => { void poll(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [inventoryId, inventoryStatus, refreshIfChanged, remoteFinalized]);

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
    const savedEntry = entryId
      ? await updateEntry(entryId, draft, { allowDuplicate })
      : await createEntry(inventoryId, draft, {
          allowDuplicate,
          createdByUserId: user?.id,
          createdByName: user?.displayName,
        });
    await refresh();
    setEditing(undefined);
    setFormDirty(false);
    setHighlightedEntryId(savedEntry.id);
    window.setTimeout(() => setHighlightedEntryId((current) => current === savedEntry.id ? undefined : current), 1800);
    void runBackgroundSync();
  }

  async function deleteEntry(): Promise<void> {
    if (!pendingDeletion) return;
    setDeleting(true);
    try {
      await tombstoneEntry(pendingDeletion.id);
      if (editing?.id === pendingDeletion.id) {
        setEditing(undefined);
        setFormDirty(false);
      }
      await refresh();
      setPendingDeletion(undefined);
      void runBackgroundSync();
    } catch (cause) {
      setError(cause instanceof Error ? `Registro não excluído. ${cause.message}` : "Registro não excluído.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteInventory(): Promise<void> {
    const currentInventory = inventory;
    if (!currentInventory || currentInventory.status !== "OPEN" || entries.length > 0) return;
    setDeletingInventory(true);
    setError(undefined);
    try {
      const { tombstoned } = await tombstoneEmptyInventory(currentInventory.id);
      const online = typeof navigator === "undefined" || navigator.onLine;
      if (online) {
        try {
          const result = await syncInventory(tombstoned.id);
          if (result.conflicts > 0) {
            await restoreInventoryAfterDeletionFailure(tombstoned.id);
            throw new Error("O inventário mudou em outro dispositivo. Ele foi mantido para conferência.");
          }
          if (!result.serverDeleted) {
            await restoreInventoryAfterDeletionFailure(tombstoned.id);
            throw new Error("Não foi possível confirmar a exclusão no servidor.");
          }
          await purgeInventory(tombstoned.id);
        } catch (cause) {
          if (cause instanceof SyncHttpError && cause.status === 404) {
            await purgeInventory(tombstoned.id);
          } else if (cause instanceof SyncHttpError) {
            await restoreInventoryAfterDeletionFailure(tombstoned.id);
            throw new Error(cause.message);
          } else if (cause instanceof TypeError) {
            setConfirmingInventoryDeletion(false);
            router.replace("/dashboard");
            return;
          } else {
            throw cause;
          }
        }
      }
      setConfirmingInventoryDeletion(false);
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? `Inventário não excluído. ${cause.message}` : "Inventário não excluído.");
    } finally {
      setDeletingInventory(false);
    }
  }

  if (loading) return <main className="shell"><div className="loading-skeleton" role="status" aria-label="Abrindo inventário"><span /><span /><span /></div></main>;
  if (!inventory) return <main className="shell unavailable-shell">
    <section className="card unavailable-card" aria-labelledby="inventory-unavailable-title">
      <BrandLogo subtitle="Beam Blanks e Blocos" />
      <div className="unavailable-icon" aria-hidden="true"><Icon name="boxes" size={28} /></div>
      <p className="eyebrow">Inventário indisponível</p>
      <h1 id="inventory-unavailable-title">Não encontramos este inventário</h1>
      <p className="muted">Este inventário não foi localizado neste dispositivo. Volte ao painel para abrir uma conferência salva ou participar com um código.</p>
      {error ? <p className="notice" role="status">{error}</p> : null}
      <div className="actions unavailable-actions">
        <Link className="primary button-link" href="/dashboard">Voltar ao painel</Link>
        <Link className="secondary button-link" href="/dashboard#participar">Participar com código</Link>
      </div>
    </section>
  </main>;

  const displayedInventory: Inventory = remoteFinalized && inventory.status === "OPEN"
    ? { ...inventory, status: "FINISHED" }
    : inventory;
  const readOnly = displayedInventory.status === "FINISHED";
  const showEntryForm = displayedInventory.status === "OPEN" || formDirty;
  const workflowSteps = [
    ["01", "Lançar", "Registrar itens"],
    ["02", "Conferir", "Revisar registros"],
    ["03", "Sincronizar", "Enviar dados"],
    ["04", "Analisar", "Ver lotes para conferência"],
    ["05", "Finalizar", "Gerar relatório"],
  ] as const;
  const currentStep = readOnly ? "Finalizar" : entries.length > 0 ? "Conferir" : "Lançar";

  return (
    <main className="shell inventory-shell">
      <aside className="inventory-rail" aria-label="Etapas do inventário">
        <Link className="brand-link" href="/dashboard" aria-label="INVENTÁRIO, painel"><BrandLogo compact subtitle="Beam Blanks e Blocos" /></Link>
        <p className="inventory-rail-kicker">Operação de campo</p>
        <p className="inventory-rail-label"><span>Inventário ativo</span><span className="inventory-current-step">Etapa atual: {currentStep}</span></p>
        <nav className="inventory-rail-steps">
           {workflowSteps.map(([number, label, description]) => <span className={`inventory-rail-step ${label === currentStep ? "active" : ""}`} key={number}><b>{number}</b><span><strong>{label}</strong><small>{description}</small></span></span>)}
        </nav>
        <p className="inventory-rail-foot"><span className="inventory-rail-foot-icon"><Icon name="cloud" size={15} /></span><span><strong>Local ativo</strong><small>Salvo neste dispositivo</small></span></p>
      </aside>
      <div className="inventory-content">
      <header className="inventory-header">
        <div className="inventory-header-row">
          <div className="inventory-header-copy">
            <Link className="back-link" href="/dashboard">‹ Painel</Link>
            <div className="inventory-header-topline"><span className="inventory-header-topline-dot" aria-hidden="true" /> <span>{readOnly ? "Inventário finalizado" : "Coleta em andamento"}</span><i aria-hidden="true">/</i><span>{entries.length ? `${entries.length} registro(s) capturado(s)` : "Aguardando primeiro lançamento"}</span></div>
            <p className="eyebrow">Inventário em operação</p>
            <h1>Inventário {formatBrazilianDate(inventory.date)}</h1>
             <p className="muted">Registros físicos ficam salvos neste dispositivo e seguem disponíveis sem internet.</p>
          </div>
          <span className="status-pill">{readOnly ? "Finalizado" : inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumo do inventário">
        <div className="metric-card metric-card--records"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="boxes" size={18} /></span><span className="metric-card-kicker">Coleta</span></div><div className="metric-card-copy"><span className="metric-label">Registros</span><span className="metric-value">{entries.length}</span></div></div>
        <div className="metric-card metric-card--lots"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="file" size={18} /></span><span className="metric-card-kicker">Rastreio</span></div><div className="metric-card-copy"><span className="metric-label">Lotes</span><span className="metric-value">{distinctLots}</span></div></div>
        <div className="metric-card metric-card--pieces"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="chart" size={18} /></span><span className="metric-card-kicker">Volume</span></div><div className="metric-card-copy"><span className="metric-label">Peças lançadas</span><span className="metric-value">{totalPieces}</span></div></div>
        <div className="metric-card metric-card--status"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="check" size={18} /></span><span className="metric-card-kicker">Estado</span></div><div className="metric-card-copy"><span className="metric-label">Situação</span><span className="metric-value">{readOnly ? "Finalizado" : "Em andamento"}</span></div></div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="stack">
        <ReferencePanel inventory={displayedInventory} onChanged={refresh} />
        <div className="entry-workspace">
          {remoteFinalized && inventory.status === "OPEN" ? <p className="notice" role="status">Este inventário foi finalizado no servidor. Os dados locais pendentes foram preservados para decisão.</p> : null}
          {showEntryForm ? <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => { setEditing(undefined); setFormDirty(false); }} referenceChecker={createReferenceLotChecker(displayedInventory)} readOnly={readOnly} onDirtyChange={setFormDirty} /> : <p className="notice">Inventário finalizado: lançamentos preservados em modo somente leitura.</p>}
          <EntryList entries={entries} onEdit={(entry) => { setEditing(entry); setFormDirty(false); }} onDelete={setPendingDeletion} readOnly={readOnly} highlightedEntryId={highlightedEntryId} />
        </div>
        <InventoryControlPanel inventory={displayedInventory} entries={entries} onChanged={refresh} />
        {displayedInventory.status === "OPEN" && entries.length === 0 && displayedInventory.isOwner !== false ? <section className="card section-card stack" aria-label="Excluir inventário vazio">
          <div className="section-header"><div><p className="eyebrow">Gestão</p><h2>Inventário vazio</h2><p className="muted">Se esta conferência foi criada por engano, você pode removê-la sem deixar mais um inventário aberto no painel.</p></div></div>
          <div className="actions"><button className="danger" type="button" disabled={deletingInventory} onClick={() => setConfirmingInventoryDeletion(true)}>Excluir inventário vazio</button></div>
        </section> : null}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        variant="danger"
        title="Excluir lançamento?"
        description={pendingDeletion ? `O lote ${pendingDeletion.lot}, no lado ${formatSideLabel(pendingDeletion.side)}, vão ${pendingDeletion.bay}${pendingDeletion.layer ? `, camada ${pendingDeletion.layer}` : ""}, com ${pendingDeletion.quantity} peça(s), será removido da lista e preservado para sincronização.` : ""}
        confirmLabel="Excluir lançamento"
        busyLabel="Excluindo…"
        busy={deleting}
        onConfirm={() => void deleteEntry()}
        onClose={() => setPendingDeletion(undefined)}
      />
      <ConfirmDialog
        open={confirmingInventoryDeletion}
        variant="danger"
        title="Excluir inventário vazio?"
        description="Esta ação remove o inventário vazio deste dispositivo e, quando houver conexão, também solicita a remoção central. Inventários com lançamentos não podem ser excluídos por este caminho."
        confirmLabel="Excluir inventário"
        busyLabel="Excluindo inventário…"
        busy={deletingInventory}
        onConfirm={() => void deleteInventory()}
        onClose={() => setConfirmingInventoryDeletion(false)}
      />
      </div>
    </main>
  );
}
