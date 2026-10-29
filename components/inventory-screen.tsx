"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { InventoryControlPanel } from "@/components/inventory-control-panel";
import { ReferencePanel, createReferenceLotChecker } from "@/components/reference-panel";
import { AppRail } from "@/components/app-rail";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { InventorySteps, deriveInventorySteps } from "@/components/inventory-steps";
import { SyncBadge, syncBadgeState, useOnline } from "@/components/sync-badge";
import heroStyles from "@/components/hero.module.css";
import summaryStyles from "@/components/inventory-summary.module.css";
import { getCurrentUser, restoreSession, type AuthUser } from "@/lib/auth-client";
import { findRemoteDuplicateLotEntries } from "@/lib/duplicate-client";
import { formatBrazilianDate } from "@/lib/local-date";
import { createEntry, DuplicateLotError, findDuplicateLotEntries, getInventory, listActiveEntries, purgeInventory, restoreInventoryAfterDeletionFailure, tombstoneEmptyInventory, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import { formatSideLabel, type EntryDraft, type Inventory, type InventoryEntry } from "@/lib/models";
import { cancelSync, INVENTORY_POLLING_INTERVAL_MS, SyncHttpError, syncInventory } from "@/lib/sync-client";

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

const numberFormat = new Intl.NumberFormat("pt-BR");

function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function InventoryScreen({ inventoryId }: { inventoryId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [inventory, setInventory] = useState<Inventory>();
  const [sessionUser, setSessionUser] = useState<AuthUser>();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [editing, setEditing] = useState<InventoryEntry>();
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pendingDeletion, setPendingDeletion] = useState<InventoryEntry>();
  const [deleting, setDeleting] = useState(false);
  const [confirmingInventoryDeletion, setConfirmingInventoryDeletion] = useState(false);
  const [deletingInventory, setDeletingInventory] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string>();
  const [formDirty, setFormDirty] = useState(false);
  const [remoteFinalized, setRemoteFinalized] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [referenceEnabled, setReferenceEnabled] = useState(false);
  const accountUserIdRef = useRef<string | undefined>(undefined);
  const syncFailureCountRef = useRef(0);
  const nextSyncRetryAtRef = useRef(0);
  const latestInventoryRef = useRef<Inventory | undefined>(undefined);
  const latestEntriesRef = useRef<InventoryEntry[]>([]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("reference");
    const storageKey = `inventory-reference:${inventoryId}`;
    if (query === "1" || query === "0") window.localStorage.setItem(storageKey, query === "1" ? "enabled" : "disabled");
    const frame = window.requestAnimationFrame(() => {
      setReferenceEnabled(query === "1" || (query !== "0" && window.localStorage.getItem(storageKey) === "enabled"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inventoryId]);

  const refresh = useCallback(async () => {
    const accountUserId = accountUserIdRef.current;
    const [currentInventory, currentEntries] = await Promise.all([getInventory(inventoryId, accountUserId), listActiveEntries(inventoryId)]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    latestInventoryRef.current = currentInventory;
    latestEntriesRef.current = currentEntries;
    setInventory(currentInventory);
    setEntries(currentEntries);
  }, [inventoryId]);

  const refreshIfChanged = useCallback(async () => {
    const previousInventory = latestInventoryRef.current;
    const previousEntries = latestEntriesRef.current;
    const accountUserId = accountUserIdRef.current;
    const [currentInventory, currentEntries] = await Promise.all([getInventory(inventoryId, accountUserId), listActiveEntries(inventoryId)]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    if (inventoryScreenKey(previousInventory) !== inventoryScreenKey(currentInventory)) setInventory(currentInventory);
    if (entriesScreenKey(previousEntries) !== entriesScreenKey(currentEntries)) setEntries(currentEntries);
    latestInventoryRef.current = currentInventory;
    latestEntriesRef.current = currentEntries;
  }, [inventoryId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const currentUser = getCurrentUser() ?? await restoreSession();
      if (!currentUser) {
        return Promise.reject(new Error("Entre na sua conta para abrir este inventário."));
      }
      setSessionUser(currentUser);
      accountUserIdRef.current = currentUser.id;
      return Promise.all([getInventory(inventoryId, currentUser.id), listActiveEntries(inventoryId)]);
    })()
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
        if (active) setLoadError(cause instanceof Error ? cause.message : "Não foi possível abrir o inventário.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [inventoryId, router]);

  const noteSyncSuccess = useCallback(() => {
    syncFailureCountRef.current = 0;
    nextSyncRetryAtRef.current = 0;
    setSyncMessage(undefined);
  }, []);

  const noteSyncFailure = useCallback((cause: unknown) => {
    if (cause instanceof Error && cause.name === "AbortError") return;
    if (cause instanceof SyncHttpError && cause.status === 401) {
      setSyncMessage(cause.message);
      router.replace("/acesso");
      return;
    }
    if (cause instanceof SyncHttpError && (cause.status === 403 || cause.status === 404)) {
      setSyncMessage(cause.message);
      router.replace("/pendencias");
      return;
    }
    syncFailureCountRef.current += 1;
    nextSyncRetryAtRef.current = Date.now() + Math.min(60_000, 1_000 * 2 ** (syncFailureCountRef.current - 1));
    setSyncMessage(cause instanceof TypeError
      ? "Sem conexão com o servidor. Os dados locais continuam disponíveis."
      : cause instanceof Error ? cause.message : "Não foi possível sincronizar agora. Os dados locais continuam disponíveis.");
  }, [router]);

  const runBackgroundSync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const result = await syncInventory(inventoryId, { background: true });
      if (result.serverDeleted) { router.replace("/pendencias"); return; }
      setRemoteFinalized(result.serverStatus === "FINISHED" && latestInventoryRef.current?.status === "OPEN");
      if (result.changed) await refreshIfChanged();
      noteSyncSuccess();
    } catch (cause) {
      noteSyncFailure(cause);
    }
  }, [inventoryId, noteSyncFailure, noteSyncSuccess, refreshIfChanged, router]);

  const inventoryStatus = inventory?.status;

  useEffect(() => {
    if (inventoryStatus !== "OPEN" && inventoryStatus !== "FINISHED") return;
    let active = true;
    let busy = false;
    let lastTriggerAt = 0;

    async function poll(): Promise<void> {
      if (!active || busy || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSyncMessage("Sem conexão. Os novos lançamentos continuam salvos neste dispositivo.");
        return;
      }
      if (Date.now() < nextSyncRetryAtRef.current) return;
      const now = Date.now();
      if (now - lastTriggerAt < 500) return;
      lastTriggerAt = now;
      busy = true;
      try {
        const result = await syncInventory(inventoryId, { background: true });
        if (!active) return;
        if (result.serverDeleted) { router.replace("/pendencias"); return; }
        setRemoteFinalized(result.serverStatus === "FINISHED" && latestInventoryRef.current?.status === "OPEN");
        if (result.changed) await refreshIfChanged();
        noteSyncSuccess();
      } catch (cause) {
        noteSyncFailure(cause);
      } finally {
        busy = false;
      }
    }

    const intervalId = window.setInterval(() => { void poll(); }, INVENTORY_POLLING_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        nextSyncRetryAtRef.current = 0;
        void poll();
      }
    };
    const handleOnline = () => {
      nextSyncRetryAtRef.current = 0;
      void poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      cancelSync(inventoryId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [inventoryId, inventoryStatus, noteSyncFailure, noteSyncSuccess, refreshIfChanged, router]);

  const totalPieces = useMemo(() => entries.reduce((sum, entry) => sum + entry.quantity, 0), [entries]);
  const distinctLots = useMemo(() => new Set(entries.map((entry) => entry.lot.trim())).size, [entries]);
  const distinctBays = useMemo(() => new Set(entries.map((entry) => `${entry.side}-${entry.bay}`)).size, [entries]);

  async function saveEntry(draft: EntryDraft, entryId?: string, allowDuplicate = false): Promise<void> {
    setError(undefined);
    const currentInventory = inventory ?? await getInventory(inventoryId, accountUserIdRef.current);
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
      {loadError ? <p className="notice" role="status">{loadError}</p> : null}
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

  return (
    <main className="shell app-page-shell inventory-shell">
      <AppRail active="inventory" showTeam={sessionUser?.teams.some((team) => team.role === "ADMIN")} showAdmin={sessionUser?.systemAdmin} />
      <div className="inventory-content">
      <header className={`${heroStyles.hero} ${heroStyles.compact}`}>
        <div className={heroStyles.topRow}>
          <Link className={heroStyles.backLink} href="/dashboard" aria-label="Voltar ao painel">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Painel
          </Link>
        </div>
        <div className={heroStyles.intro}>
          <p className={heroStyles.kicker}>{readOnly ? "Inventário finalizado" : "Coleta em andamento"}</p>
          <h1 className={heroStyles.title}>Inventário {formatBrazilianDate(inventory.date)}</h1>
          <p className={heroStyles.lead}>Aberto às {formatClock(inventory.createdAt)} · <strong>{entries.length} {entries.length === 1 ? "registro" : "registros"}</strong><span className={heroStyles.leadExtra}> · salvo neste aparelho, funciona sem internet</span></p>
        </div>
        <div className={heroStyles.meta}>
          <SyncBadge tone="navy" state={syncBadgeState(inventory.syncStatus, readOnly, online)} time={formatClock(inventory.updatedAt)} />
          {!readOnly && inventory.participationCode ? <span className={heroStyles.chip}>Equipe <span className={heroStyles.code}>{inventory.participationCode.replace(/^(\d{3})(\d{3})$/, "$1 $2")}</span></span> : null}
        </div>
      </header>

      <InventorySteps steps={deriveInventorySteps({ entries: entries.length, synced: inventory.syncStatus === "SYNCED", finished: readOnly })} />

      <dl className={summaryStyles.summary} aria-label="Resumo do inventário">
        <div className={summaryStyles.item} data-metric="records"><dt className={summaryStyles.label}>Registros</dt><dd className={summaryStyles.value} data-metric-value>{numberFormat.format(entries.length)}</dd></div>
        <div className={summaryStyles.item} data-metric="lots"><dt className={summaryStyles.label}>Lotes</dt><dd className={summaryStyles.value} data-metric-value>{numberFormat.format(distinctLots)}</dd></div>
        <div className={summaryStyles.item} data-metric="pieces"><dt className={summaryStyles.label}>Peças</dt><dd className={summaryStyles.value} data-metric-value>{numberFormat.format(totalPieces)}</dd></div>
        <div className={summaryStyles.item} data-metric="bays"><dt className={summaryStyles.label}>Vãos</dt><dd className={summaryStyles.value} data-metric-value>{numberFormat.format(distinctBays)}</dd></div>
      </dl>

      {error && <p className="error" role="alert">{error}</p>}
      {syncMessage ? <p className="notice" role="status">{syncMessage}</p> : null}
      <div className="stack">
        {referenceEnabled ? <ReferencePanel inventory={displayedInventory} onChanged={refresh} /> : null}
        <div className="entry-workspace">
          {remoteFinalized && inventory.status === "OPEN" ? <p className="notice" role="status">Este inventário foi finalizado no servidor. Os dados locais pendentes foram preservados para decisão.</p> : null}
          {showEntryForm ? <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => { setEditing(undefined); setFormDirty(false); }} referenceChecker={referenceEnabled ? createReferenceLotChecker(displayedInventory) : undefined} readOnly={readOnly} onDirtyChange={setFormDirty} /> : <p className="notice">Inventário finalizado: lançamentos preservados em modo somente leitura.</p>}
          <EntryList inventoryId={inventory.id} entries={entries} onEdit={(entry) => { setEditing(entry); setFormDirty(false); }} onDelete={setPendingDeletion} readOnly={readOnly} highlightedEntryId={highlightedEntryId} compact />
        </div>
        <InventoryControlPanel inventory={displayedInventory} entries={entries} onChanged={refresh} />
        {displayedInventory.status === "OPEN" && entries.length === 0 && displayedInventory.isOwner !== false ? <section className={summaryStyles.options} aria-label="Excluir inventário vazio">
          <p className={summaryStyles.optionsCopy}><strong>Criou por engano?</strong>Um inventário sem registros pode ser removido para não ficar aberto no painel.</p>
          <button className={summaryStyles.dangerLink} type="button" disabled={deletingInventory} onClick={() => setConfirmingInventoryDeletion(true)}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>Excluir inventário vazio
          </button>
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
