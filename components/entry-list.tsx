"use client";

import { groupEntries } from "@/lib/grouping";
import type { InventoryEntry } from "@/lib/models";

interface EntryListProps {
  entries: InventoryEntry[];
  onEdit: (entry: InventoryEntry) => void;
  onDelete: (entry: InventoryEntry) => void;
  readOnly?: boolean;
}

export function EntryList({ entries, onEdit, onDelete, readOnly = false }: EntryListProps) {
  const groups = groupEntries(entries);
  return (
    <section className="stack" aria-label="Lançamentos registrados">
      <div className="topbar"><h2>Lançamentos</h2><span className="muted">{entries.length} registro(s)</span></div>
      {groups.length === 0 ? <p className="notice">Nenhum lançamento registrado ainda.</p> : null}
      {groups.map((group) => (
        <section className="card stack" key={group.side} aria-label={`Lado ${group.side}`}>
          <h3 className="side-heading">{group.side}</h3>
          {group.bays.map(({ bay, entries: bayEntries }) => (
            <section key={bay} aria-label={`Vão ${bay}`}>
              <h3>Vão {bay}</h3>
              {bayEntries.map((entry) => (
                <article className="entry-row" key={entry.id}>
                  <div><strong>Lote {entry.lot}</strong><br /><span className="muted">{entry.quantity} peça(s)</span></div>
                  {!readOnly ? <div className="entry-actions">
                    <button className="small-button" type="button" onClick={() => onEdit(entry)}>Editar</button>
                    <button className="small-button delete" type="button" onClick={() => onDelete(entry)}>Excluir</button>
                  </div> : null}
                </article>
              ))}
            </section>
          ))}
        </section>
      ))}
    </section>
  );
}
