import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";

export type AppRailRoute = "home" | "history" | "team";

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

export function AppRail({ active, creating = false, onCreate, showTeam = false, showAdmin = false }: AppRailProps) {
  return (
    <aside className="dashboard-sidebar app-rail" aria-label="Navegação do sistema">
      <Link className="brand-link" href="/dashboard" aria-label="INVENTÁRIO, painel">
        <BrandLogo light compact subtitle="Beam Blanks e Blocos" />
      </Link>
      <p className="app-rail-kicker">Operação de campo</p>
      <nav className="dashboard-nav">
        <Link className={activeClass(active, "home")} href="/dashboard" aria-current={active === "home" ? "page" : undefined}>
          <span aria-hidden="true"><Icon name="home" size={17} /></span>Início
        </Link>
        {onCreate ? (
          <button className="dashboard-nav-link" type="button" onClick={onCreate} disabled={creating}>
            <span aria-hidden="true"><Icon name="plus" size={17} /></span>{creating ? "Criando…" : "Novo inventário"}
          </button>
        ) : (
          <Link className="dashboard-nav-link" href="/dashboard">
            <span aria-hidden="true"><Icon name="plus" size={17} /></span>Novo inventário
          </Link>
        )}
        <Link className="dashboard-nav-link" href="/dashboard#em-andamento">
          <span aria-hidden="true"><Icon name="boxes" size={17} /></span>Em andamento
        </Link>
        <Link className={activeClass(active, "history")} href="/historico" aria-current={active === "history" ? "page" : undefined}>
          <span aria-hidden="true"><Icon name="history" size={17} /></span>Histórico
        </Link>
        <Link className="dashboard-nav-link" href="/pendencias">
          <span aria-hidden="true"><Icon name="sync" size={17} /></span>Pendências locais
        </Link>
        {showTeam ? (
          <Link className={activeClass(active, "team")} href="/equipe" aria-current={active === "team" ? "page" : undefined}>
            <span aria-hidden="true"><Icon name="users" size={17} /></span>Equipe
          </Link>
        ) : null}
        {showAdmin ? <Link className="dashboard-nav-link" href="/admin">
          <span aria-hidden="true"><Icon name="settings" size={17} /></span>Administração
        </Link> : null}
      </nav>
      <p className="sidebar-footnote app-rail-foot">
        <span className="app-rail-foot-icon" aria-hidden="true"><Icon name="cloud" size={15} /></span>
        <span><strong>Local ativo</strong><small>Sincronização protegida</small></span>
      </p>
    </aside>
  );
}
