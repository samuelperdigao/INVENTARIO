"use client";

import Link from "next/link";

import { groupEntries } from "@/lib/grouping";
import { formatSideLabel, type InventoryEntry } from "@/lib/models";

interface EntryListProps {
  inventoryId: string;
  entries: InventoryEntry[];
  onEdit: (entry: InventoryEntry) => void;
  onDelete: (entry: InventoryEntry) => void;
  readOnly?: boolean;
  highlightedEntryId?: string;
  compact?: boolean;
}

export function EntryList({ inventoryId, entries, onEdit, onDelete, readOnly = false, highlightedEntryId, compact = false }: EntryListProps) {
  const groups = groupEntries(entries);

  if (compact) {
    return (
      <section className="card section-card panel-card stack entries-section entries-section--compact" aria-label="Lançamentos registrados">
        <div className="section-header">
          <div className="panel-heading">
            <span className="panel-index" aria-hidden="true">02</span>
            <div className="panel-copy">
              <p className="eyebrow">Conferência</p>
              <h2>Lançamentos</h2>
              <p className="muted">A lista fica compacta nesta tela. Abra a conferência para consultar, editar ou excluir os registros.</p>
            </div>
          </div>
          <span className="status-pill">{entries.length} registro(s)</span>
        </div>
        <Link className="entry-list-preview" href={`/inventarios/${inventoryId}/lancamentos`} aria-label="Abrir lista completa de lançamentos">
          <span className="entry-list-preview-copy">
            <strong>{entries.length ? `${entries.length} registro(s) pronto(s) para consulta` : "Nenhum lançamento registrado ainda"}</strong>
            <span>{entries.length ? "Lotes organizados por lado e vão, sem ocupar toda a tela principal." : "A lista detalhada aparecerá aqui depois do primeiro lançamento."}</span>
          </span>
          <span className="entry-list-preview-cta">Abrir lançamentos <span aria-hidden="true">→</span></span>
        </Link>
      </section>
    );
  }

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
        <section className="card stack" key={group.side} aria-label={`Lado ${formatSideLabel(group.side)}`}>
          <h3 className="side-heading">Lado {formatSideLabel(group.side)}</h3>
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
