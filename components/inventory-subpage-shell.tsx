"use client";

import Link from "next/link";

import { AppRail } from "@/components/app-rail";
import { formatBrazilianDate } from "@/lib/local-date";
import type { Inventory } from "@/lib/models";

interface InventorySubpageShellProps {
  inventory: Inventory;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function InventorySubpageShell({ inventory, eyebrow, title, description, children }: InventorySubpageShellProps) {
  return (
    <main className="shell app-page-shell inventory-subpage-shell">
      <AppRail active="home" />
      <div className="app-page-content">
        <header className="page-topbar">
          <Link className="back-link" href={`/inventarios/${inventory.id}`}>‹ Voltar ao inventário</Link>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title} · {formatBrazilianDate(inventory.date)}</h1>
            <p className="muted">{description}</p>
          </div>
          <span className="status-pill">{inventory.status === "FINISHED" ? "Finalizado" : inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span>
        </header>
        <div className="stack">{children}</div>
      </div>
    </main>
  );
}

export function InventorySubpageLoading({ label }: { label: string }) {
  return <main className="shell app-page-shell"><AppRail active="home" /><div className="app-page-content"><div className="loading-skeleton" role="status" aria-label={label}><span /><span /><span /></div></div></main>;
}

export function InventorySubpageUnavailable({ error }: { error?: string }) {
  return <main className="shell app-page-shell"><AppRail active="home" /><div className="app-page-content"><section className="card section-card unavailable-card stack"><p className="eyebrow">Inventário indisponível</p><h1>Não encontramos este inventário</h1><p className="muted">Este inventário não foi localizado neste dispositivo. Volte ao painel para abrir uma conferência salva.</p>{error ? <p className="notice" role="status">{error}</p> : null}<Link className="primary button-link" href="/dashboard">Voltar ao painel</Link></section></div></main>;
}
