"use client";

import { useRef, useState } from "react";

import styles from "@/components/entry-form.module.css";
import { DuplicateLotError } from "@/lib/inventory-repository";
import { INVENTORY_LAYERS, type EntryDraft, type InventoryEntry, type InventoryLayer, type Side } from "@/lib/models";

interface EntryFormProps {
  editing?: InventoryEntry;
  onSave: (draft: EntryDraft, entryId?: string, allowDuplicate?: boolean) => Promise<void>;
  onCancelEdit: () => void;
}

export function EntryForm({ editing, onSave, onCancelEdit }: EntryFormProps) {
  const [side, setSide] = useState<Side | undefined>(editing?.side);
  const [bay, setBay] = useState(editing?.bay ?? "");
  const [layer, setLayer] = useState<InventoryLayer | "">(editing?.layer ?? "");
  const [lot, setLot] = useState(editing?.lot ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [duplicates, setDuplicates] = useState<InventoryEntry[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const lotInputRef = useRef<HTMLInputElement>(null);

  function currentDraft(): EntryDraft | undefined {
    if (side !== "EF" && side !== "DE") {
      setError("Selecione o lado.");
      return undefined;
    }
    if (!bay.trim()) {
      setError("Informe o vão.");
      return undefined;
    }
    if (!layer) {
      setError("Selecione a camada.");
      return undefined;
    }
    if (!lot.trim()) {
      setError("Informe o lote.");
      return undefined;
    }
    if (!/^\d+$/.test(lot)) {
      setError("O lote deve conter somente números.");
      return undefined;
    }
    if (!/^\d+$/.test(quantity) || Number(quantity) <= 0 || !Number.isSafeInteger(Number(quantity))) {
      setError("A quantidade deve ser um inteiro positivo.");
      return undefined;
    }
    return { side, bay, layer, lot, quantity: Number(quantity) };
  }

  async function persist(draft: EntryDraft, allowDuplicate = false): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft, editing?.id, allowDuplicate);
      setDuplicates([]);
      setLot("");
      setQuantity("");
      lotInputRef.current?.focus();
    } catch (cause) {
      if (cause instanceof DuplicateLotError) {
        setDuplicates(cause.duplicates);
        return;
      }
      const message = cause instanceof Error ? cause.message : "Falha de armazenamento.";
      setError(`Registro não salvo. ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const draft = currentDraft();
    if (draft) await persist(draft);
  }

  async function confirmDuplicate(): Promise<void> {
    const draft = currentDraft();
    if (draft) await persist(draft, true);
  }

  return (
    <>
      <form className="card section-card panel-card stack" onSubmit={(event) => void handleSubmit(event)} aria-label="Novo registro">
        <div className="section-header">
          <div className="panel-heading">
            <span className="panel-index" aria-hidden="true">01</span>
            <div className="panel-copy">
              <p className="eyebrow">Lançamento</p>
              <h2>{editing ? "Editar registro" : "Novo registro"}</h2>
              <p className="muted">Informe a posição física, o lote e a quantidade encontrada. Lado, vão e camada permanecem selecionados após salvar.</p>
            </div>
          </div>
          {editing && <button className="secondary" type="button" onClick={onCancelEdit}>Cancelar edição</button>}
        </div>

        <fieldset className="fieldset-clean form-section">
          <legend>Lado</legend>
          <div className="side-options">
            {(["EF", "DE"] as Side[]).map((option) => (
              <button
                className="side-button"
                key={option}
                type="button"
                aria-pressed={side === option}
                onClick={() => setSide(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.positionGrid}>
          <label className="field" htmlFor="bay">Vão
            <input id="bay" name="bay" value={bay} onChange={(event) => setBay(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ex.: 15" />
          </label>
          <label className="field" htmlFor="layer">Camada
            <select id="layer" name="layer" value={layer} onChange={(event) => setLayer(event.target.value as InventoryLayer | "")}>
              <option value="">Selecione</option>
              {INVENTORY_LAYERS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="field" htmlFor="lot">Lote
            <input
              ref={lotInputRef}
              id="lot"
              name="lot"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={lot}
              onChange={(event) => setLot(event.target.value.replace(/\D/g, ""))}
              autoComplete="off"
              placeholder="Número do lote"
            />
          </label>
          <label className="field" htmlFor="quantity">Quantidade de peças
            <input id="quantity" name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))} inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="Ex.: 20" />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar"}</button>
      </form>

      {duplicates.length > 0 && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDuplicates([]); }}>
          <section className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <div className={styles.modalHeader}>
              <p className="eyebrow">Atenção</p>
              <h3 id="duplicate-title">Lote já registrado</h3>
              <p className="muted">O lote {lot} já possui lançamento neste inventário. Confira os registros existentes antes de adicionar novamente.</p>
            </div>
            <ul className={styles.duplicateList}>
              {duplicates.slice(0, 5).map((entry) => (
                <li className={styles.duplicateItem} key={entry.id}>
                  <strong>{entry.createdByName || "Usuário não identificado"}</strong>
                  <div className={styles.duplicateMeta}>
                    <span>Vão: {entry.bay}</span>
                    <span>Camada: {entry.layer ?? "Legado"}</span>
                    <span>Lado: {entry.side}</span>
                    <span>Quantidade: {entry.quantity}</span>
                  </div>
                </li>
              ))}
            </ul>
            {duplicates.length > 5 && <p className="muted">Há mais {duplicates.length - 5} lançamento(s) deste lote.</p>}
            <div className={styles.modalActions}>
              <button className="secondary" type="button" disabled={saving} onClick={() => setDuplicates([])}>Cancelar</button>
              <button className="primary" type="button" disabled={saving} onClick={() => void confirmDuplicate()}>{saving ? "Salvando…" : "Adicionar mesmo assim"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
