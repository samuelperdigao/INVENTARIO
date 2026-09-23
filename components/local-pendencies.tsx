"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppRail } from "@/components/app-rail";
import { restoreSession, type AuthUser } from "@/lib/auth-client";
import { db } from "@/lib/db";
import { formatBrazilianDate } from "@/lib/local-date";
import { formatSideLabel, type Inventory, type InventoryEntry } from "@/lib/models";

interface PendingRow { inventory?: Inventory; entry: InventoryEntry }

function csvCell(value: string): string {
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function LocalPendencies() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void restoreSession().then(async (current) => {
      if (!active) return;
      if (!current) { router.replace("/acesso"); return; }
      setUser(current);
      const entries = await db.entries.filter((entry) => entry.syncStatus === "ERROR" || entry.syncStatus === "PENDING").toArray();
      const inventories = await db.inventories.bulkGet(entries.map((entry) => entry.inventoryId));
      if (!active) return;
      setRows(entries.map((entry, index) => ({ entry, inventory: inventories[index] }))
        .filter(({ entry, inventory }) => entry.syncStatus === "ERROR" || inventory?.tombstone));
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao consultar dados locais."); });
    return () => { active = false; };
  }, [router]);

  function download(): void {
    const lines = [
      ["Data", "Lado", "Vão", "Camada", "Lote", "Quantidade", "Estado"].join(","),
      ...rows.map(({ inventory, entry }) => [
        inventory?.date ?? "", formatSideLabel(entry.side), entry.bay, entry.layer ?? "",
        entry.lot, String(entry.quantity), inventory?.tombstone ? "Inventário excluído" : "Conflito",
      ].map(csvCell).join(",")),
    ];
    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "Inventario_pendencias_locais.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return <main className="shell app-page-shell"><AppRail active="home" showAdmin={user?.systemAdmin} />
    <div className="app-page-content"><header className="page-topbar"><Link className="back-link" href="/dashboard">‹ Voltar ao painel</Link>
      <div><p className="eyebrow">Dados deste dispositivo</p><h1>Pendências locais</h1><p className="muted">Confira lançamentos que exigem decisão antes de seguir.</p></div></header>
      <section className="card section-card stack"><div className="section-header"><div><h2>Lançamentos preservados</h2>
        <p className="muted">Dados de inventários excluídos permanecem neste dispositivo para conferência e exportação.</p></div>
        <button type="button" className="secondary" disabled={!rows.length} onClick={download}>Baixar CSV</button></div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {!rows.length && !error ? <p className="empty-state">Nenhuma pendência encontrada neste dispositivo.</p> : null}
        {rows.map(({ entry, inventory }) => <div className="card inventory-card" key={entry.id}>
          <div><strong>Lote {entry.lot}: {entry.quantity} peça(s)</strong>
            <p className="muted">{formatSideLabel(entry.side)} · Vão {entry.bay}{entry.layer ? ` · Camada ${entry.layer}` : ""}
              {inventory?.date ? ` · ${formatBrazilianDate(inventory.date)}` : ""}</p>
            <span className="micro-pill">{inventory?.tombstone ? "Inventário excluído" : "Conflito de sincronização"}</span></div>
          {!inventory?.tombstone && inventory ? <Link href={`/inventarios/${inventory.id}`} className="secondary">Revisar no inventário</Link> : null}
        </div>)}
      </section></div></main>;
}
