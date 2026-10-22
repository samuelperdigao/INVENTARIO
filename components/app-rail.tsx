"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { restoreSession } from "@/lib/auth-client";
import { createInventory } from "@/lib/inventory-repository";

export type AppRailRoute = "home" | "history" | "team" | "pending" | "admin";

interface AppRailProps {
  active: AppRailRoute;
  creating?: boolean;
  onCreate?: () => void;
  showTeam?: boolean;
  showAdmin?: boolean;
}

function activeClass(active: AppRailRoute, route: AppRailRoute): string {
  return `dashboard-nav-link${active === route ? " active" : ""}`;
}

function moreActive(active: AppRailRoute): boolean {
  return active === "pending" || active === "team" || active === "admin";
}

export function AppRail({ active, creating = false, onCreate, showTeam = false, showAdmin = false }: AppRailProps) {
  const router = useRouter();
  const [localCreating, setLocalCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const isCreating = creating || localCreating;

  async function createFromRail(): Promise<void> {
    if (onCreate) { onCreate(); return; }
    setLocalCreating(true);
    setCreateError(undefined);
    try {
      const user = await restoreSession();
      if (!user) { router.replace("/acesso"); return; }
      const inventory = await createInventory(undefined, user.id);
      router.push(`/inventarios/${inventory.id}`);
    } catch {
      setCreateError("Não foi possível criar o inventário. Nenhum dado foi salvo.");
      setLocalCreating(false);
    }
  }

  return (
    <aside className="dashboard-sidebar app-rail" aria-label="Navegação do sistema">
      <Link className="brand-link" href="/dashboard" aria-label="INVENTÁRIO, painel">
        <BrandLogo light compact subtitle="Beam Blanks e Blocos" />
      </Link>
      <nav className="dashboard-nav">
        <Link className={activeClass(active, "home")} href="/dashboard" aria-current={active === "home" ? "page" : undefined}>
          <span aria-hidden="true"><Icon name="home" size={17} /></span>Início
        </Link>
        <button className="dashboard-nav-link nav-create" type="button" onClick={() => void createFromRail()} disabled={isCreating} aria-label={isCreating ? "Criando inventário" : "Novo inventário"}>
          <span aria-hidden="true"><Icon name="plus" size={17} /></span>{isCreating ? "Criando…" : "Novo inventário"}
        </button>
        <Link className="dashboard-nav-link nav-in-progress" href="/dashboard#em-andamento">
          <span aria-hidden="true"><Icon name="boxes" size={17} /></span>Em andamento
        </Link>
        <Link className={activeClass(active, "history")} href="/historico" aria-current={active === "history" ? "page" : undefined}>
          <span aria-hidden="true"><Icon name="history" size={17} /></span>Histórico
        </Link>
        <details className={`rail-more${moreActive(active) ? " active" : ""}`}>
          <summary className="dashboard-nav-link" aria-label="Mais opções" aria-current={moreActive(active) ? "page" : undefined}>
            <span aria-hidden="true"><Icon name="menu" size={17} /></span><span className="rail-more-label">Mais</span>
          </summary>
          <div className="rail-more-menu">
            <Link className={`dashboard-nav-link${active === "pending" ? " active" : ""}`} href="/pendencias" aria-current={active === "pending" ? "page" : undefined}>
              <span aria-hidden="true"><Icon name="sync" size={17} /></span>Pendências locais
            </Link>
            {showTeam ? (
              <Link className={activeClass(active, "team")} href="/equipe" aria-current={active === "team" ? "page" : undefined}>
                <span aria-hidden="true"><Icon name="users" size={17} /></span>Equipe
              </Link>
            ) : null}
            {showAdmin ? <Link className={activeClass(active, "admin")} href="/admin" aria-current={active === "admin" ? "page" : undefined}>
              <span aria-hidden="true"><Icon name="settings" size={17} /></span>Administração
            </Link> : null}
          </div>
        </details>
      </nav>
      {createError ? <p className="rail-create-error" role="alert">{createError}</p> : null}
      <p className="sidebar-footnote app-rail-foot">
        <span className="app-rail-foot-icon" aria-hidden="true"><Icon name="cloud" size={15} /></span>
        <span><strong>Local ativo</strong><small>Sincronização protegida</small></span>
      </p>
    </aside>
  );
}
