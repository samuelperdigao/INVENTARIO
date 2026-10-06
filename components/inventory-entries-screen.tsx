"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EntryForm } from "@/components/entry-form";
import { EntryList } from "@/components/entry-list";
import { InventorySubpageShell, InventorySubpageLoading, InventorySubpageUnavailable } from "@/components/inventory-subpage-shell";
import { findDuplicateLotEntries, DuplicateLotError, tombstoneEntry, updateEntry } from "@/lib/inventory-repository";
import type { EntryDraft, InventoryEntry } from "@/lib/models";
import { syncInventory } from "@/lib/sync-client";
import { useLocalInventory } from "@/components/use-local-inventory";

export function InventoryEntriesScreen({ inventoryId }: { inventoryId: string }) {
  const { inventory, entries, loading, error, refresh } = useLocalInventory(inventoryId);
  const [editing, setEditing] = useState<InventoryEntry>();
  const [pendingDeletion, setPendingDeletion] = useState<InventoryEntry>();
  const [deleting, setDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const [highlightedEntryId, setHighlightedEntryId] = useState<string>();

  async function saveEntry(draft: EntryDraft, entryId?: string, allowDuplicate = false): Promise<void> {
    if (!entryId) return;
    if (!allowDuplicate) {
      const duplicates = await findDuplicateLotEntries(inventoryId, draft.lot, entryId);
      if (duplicates.length > 0) throw new DuplicateLotError(duplicates);
    }

    const savedEntry = await updateEntry(entryId, draft, { allowDuplicate });
    await refresh();
    setEditing(undefined);
    setOperationError(undefined);
    setHighlightedEntryId(savedEntry.id);
    window.setTimeout(() => setHighlightedEntryId((current) => current === savedEntry.id ? undefined : current), 1800);
    void syncInventory(inventoryId, { background: true }).catch(() => undefined);
  }

  async function deleteEntry(): Promise<void> {
    if (!pendingDeletion) return;
    setDeleting(true);
    try {
      await tombstoneEntry(pendingDeletion.id);
      if (editing?.id === pendingDeletion.id) setEditing(undefined);
      await refresh();
      setPendingDeletion(undefined);
      setOperationError(undefined);
      void syncInventory(inventoryId, { background: true }).catch(() => undefined);
    } catch (cause) {
      setOperationError(cause instanceof Error ? `Registro não excluído. ${cause.message}` : "Registro não excluído.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <InventorySubpageLoading label="Abrindo lançamentos" />;
  if (!inventory) return <InventorySubpageUnavailable error={error} />;

  const readOnly = inventory.status === "FINISHED";

  return (
    <InventorySubpageShell inventory={inventory} eyebrow="Conferência" title="Lançamentos" description="Consulte os registros por lado e vão. As alterações continuam sendo salvas neste dispositivo antes da sincronização.">
      {operationError ? <p className="error" role="alert">{operationError}</p> : null}
      {!readOnly && editing ? <EntryForm editing={editing} onSave={saveEntry} onCancelEdit={() => setEditing(undefined)} /> : null}
      <EntryList
        inventoryId={inventory.id}
        entries={entries}
        onEdit={(entry) => { if (!readOnly) setEditing(entry); }}
        onDelete={(entry) => { if (!readOnly) setPendingDeletion(entry); }}
        readOnly={readOnly}
        highlightedEntryId={highlightedEntryId}
      />
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
    </InventorySubpageShell>
  );
}
