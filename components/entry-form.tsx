"use client";

import { useRef, useState } from "react";

import type { EntryDraft, InventoryEntry, Side } from "@/lib/models";

interface EntryFormProps {
  editing?: InventoryEntry;
  onSave: (draft: EntryDraft, entryId?: string) => Promise<void>;
  onCancelEdit: () => void;
}

export function EntryForm({ editing, onSave, onCancelEdit }: EntryFormProps) {
  const [side, setSide] = useState<Side | undefined>(editing?.side);
  const [bay, setBay] = useState(editing?.bay ?? "");
  const [lot, setLot] = useState(editing?.lot ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const lotInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (side !== "EF" && side !== "DE") {
      setError("Selecione o lado.");
      return;
    }
    if (!bay.trim()) {
      setError("Informe o vão.");
      return;
    }
    if (!lot.trim()) {
      setError("Informe o lote.");
      return;
    }
    if (!/^\d+$/.test(quantity) || Number(quantity) <= 0 || !Number.isSafeInteger(Number(quantity))) {
      setError("A quantidade deve ser um inteiro positivo.");
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await onSave({ side, bay, lot, quantity: Number(quantity) }, editing?.id);
      setLot("");
      setQuantity("");
      lotInputRef.current?.focus();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha de armazenamento.";
      setError(`Registro não salvo. ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card section-card panel-card stack" onSubmit={(event) => void handleSubmit(event)} aria-label="Novo registro">
      <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">01</span>
          <div className="panel-copy">
            <p className="eyebrow">Lançamento</p>
            <h2>{editing ? "Editar registro" : "Novo registro"}</h2>
            <p className="muted">Informe a posição física, o lote e a quantidade encontrada. Lado e vão permanecem selecionados após salvar.</p>
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

      <div className="form-grid">
        <label className="field" htmlFor="bay">Vão
          <input id="bay" name="bay" value={bay} onChange={(event) => setBay(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ex.: 15" />
        </label>
        <label className="field" htmlFor="lot">Lote
          <input ref={lotInputRef} id="lot" name="lot" value={lot} onChange={(event) => setLot(event.target.value)} autoComplete="off" placeholder="Número do lote" />
        </label>
        <label className="field" htmlFor="quantity">Quantidade de peças
          <input id="quantity" name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Ex.: 20" />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar"}</button>
    </form>
  );
}
