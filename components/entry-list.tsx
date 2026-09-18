"use client";

import { groupEntries } from "@/lib/grouping";
import type { InventoryEntry } from "@/lib/models";

interface EntryListProps {
  entries: InventoryEntry[];
  onEdit: (entry: InventoryEntry) => void;
  onDelete: (entry: InventoryEntry) => void;
  readOnly?: boolean;
  highlightedEntryId?: string;
}

export function EntryList({ entries, onEdit, onDelete, readOnly = false, highlightedEntryId }: EntryListProps) {
  const groups = groupEntries(entries);
  return (
    <section className="card section-card panel-card stack entries-section" aria-label="Lançamentos registrados">
      <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">02</span>
          <div className="panel-copy">
            <p className="eyebrow">Conferência</p>
            <h2>Lançamentos</h2>
            <p className="muted">Registros individuais organizados por lado e vão, com a camada física identificada em cada lote.</p>
          </div>
        </div>
        <span className="status-pill">{entries.length} registro(s)</span>
      </div>
      {groups.length === 0 ? <p className="notice">Nenhum lançamento registrado ainda.</p> : null}
      {groups.map((group) => (
        <section className="card stack" key={group.side} aria-label={`Lado ${group.side}`}>
          <h3 className="side-heading">Lado {group.side}</h3>
          {group.bays.map(({ bay, entries: bayEntries }) => (
            <section className="bay-block" key={bay} aria-label={`Vão ${bay}`}>
              <h3>Vão {bay}</h3>
              {bayEntries.map((entry) => (
                <article className={`entry-row ${highlightedEntryId === entry.id ? "entry-row-highlighted" : ""}`} key={entry.id}>
                  <div className="entry-title">
                    <strong>Lote {entry.lot}</strong><br />
                    <span className="muted">Camada {entry.layer ?? "não informada"} · {entry.quantity} peça(s)</span>
                  </div>
                  {!readOnly ? <div className="entry-actions">
                    <button className="small-button" type="button" onClick={() => onEdit(entry)}>Editar</button>
                    <button className="small-button delete" type="button" onClick={() => onDelete(entry)}>Excluir</button>
                  </div> : <span className="micro-pill">Somente leitura</span>}
                </article>
              ))}
            </section>
          ))}
        </section>
      ))}
    </section>
  );
}
