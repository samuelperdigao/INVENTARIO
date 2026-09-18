"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [highlightedEntryId, setHighlightedEntryId] = useState<string>();

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
    const savedEntry = entryId
      ? await updateEntry(entryId, draft, { allowDuplicate })
      : await createEntry(inventoryId, draft, {
          allowDuplicate,
          createdByUserId: user?.id,
          createdByName: user?.displayName,
        });
    await refresh();
    setEditing(undefined);
    setHighlightedEntryId(savedEntry.id);
    window.setTimeout(() => setHighlightedEntryId((current) => current === savedEntry.id ? undefined : current), 1800);
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

  const workflowSteps = [
    ["01", "Lançar", "Registrar itens"],
    ["02", "Conferir", "Revisar registros"],
    ["03", "Sincronizar", "Enviar dados"],
    ["04", "Analisar", "Ver lotes para conferência"],
    ["05", "Finalizar", "Gerar relatório"],
  ] as const;
  const currentStep = inventory.status === "FINISHED" ? "Finalizar" : entries.length > 0 ? "Conferir" : "Lançar";

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
            <div className="inventory-header-topline"><span className="inventory-header-topline-dot" aria-hidden="true" /> <span>Coleta em andamento</span><i aria-hidden="true">/</i><span>{entries.length ? `${entries.length} registro(s) capturado(s)` : "Aguardando primeiro lançamento"}</span></div>
            <p className="eyebrow">Inventário em operação</p>
            <h1>Inventário {formatBrazilianDate(inventory.date)}</h1>
             <p className="muted">Registros físicos ficam salvos neste dispositivo e seguem disponíveis sem internet.</p>
          </div>
          <span className="status-pill">{inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumo do inventário">
        <div className="metric-card metric-card--records"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="boxes" size={18} /></span><span className="metric-card-kicker">Coleta</span></div><div className="metric-card-copy"><span className="metric-label">Registros</span><span className="metric-value">{entries.length}</span></div></div>
        <div className="metric-card metric-card--lots"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="file" size={18} /></span><span className="metric-card-kicker">Rastreio</span></div><div className="metric-card-copy"><span className="metric-label">Lotes</span><span className="metric-value">{distinctLots}</span></div></div>
        <div className="metric-card metric-card--pieces"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="chart" size={18} /></span><span className="metric-card-kicker">Volume</span></div><div className="metric-card-copy"><span className="metric-label">Peças lançadas</span><span className="metric-value">{totalPieces}</span></div></div>
        <div className="metric-card metric-card--status"><div className="metric-card-top"><span className="metric-card-icon" aria-hidden="true"><Icon name="check" size={18} /></span><span className="metric-card-kicker">Estado</span></div><div className="metric-card-copy"><span className="metric-label">Situação</span><span className="metric-value">{inventory.status === "FINISHED" ? "Finalizado" : "Em andamento"}</span></div></div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="stack">
        <ReferencePanel inventory={inventory} onChanged={refresh} />
        <div className="entry-workspace">
          {inventory.status === "OPEN" ? <EntryForm key={editing?.id ?? "new"} editing={editing} onSave={saveEntry} onCancelEdit={() => setEditing(undefined)} referenceChecker={createReferenceLotChecker(inventory)} /> : <p className="notice">Inventário finalizado: lançamentos preservados em modo somente leitura.</p>}
          <EntryList entries={entries} onEdit={setEditing} onDelete={setPendingDeletion} readOnly={inventory.status === "FINISHED"} highlightedEntryId={highlightedEntryId} />
        </div>
        <InventoryControlPanel inventory={inventory} entries={entries} onChanged={refresh} />
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
