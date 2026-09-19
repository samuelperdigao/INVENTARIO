"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import styles from "@/components/inventory-home.module.css";
import { AppRail } from "@/components/app-rail";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { logoutAccount, restoreSession, type AuthUser } from "@/lib/auth-client";
import { createInventory, listOpenInventories, listPendingInventoryDeletions, purgeInventory, restoreInventoryAfterDeletionFailure } from "@/lib/inventory-repository";
import { formatBrazilianDate } from "@/lib/local-date";
import type { Inventory } from "@/lib/models";
import { SyncHttpError, joinInventoryByCode, syncInventory } from "@/lib/sync-client";

function visualLabels(inventories: Inventory[]): Map<string, string> {
  const occurrences = new Map<string, number>();
  return new Map(inventories.map((inventory) => {
    const number = (occurrences.get(inventory.date) ?? 0) + 1;
    occurrences.set(inventory.date, number);
    return [inventory.id, `Inventário ${formatBrazilianDate(inventory.date)}${number > 1 ? ` #${number}` : ""}`];
  }));
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

async function reconcilePendingInventoryDeletions(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const pending = await listPendingInventoryDeletions();
  for (const inventory of pending) {
    try {
      const result = await syncInventory(inventory.id);
      if (result.serverDeleted && result.conflicts === 0) {
        await purgeInventory(inventory.id);
      } else {
        await restoreInventoryAfterDeletionFailure(inventory.id);
      }
    } catch (cause) {
      if (cause instanceof SyncHttpError && cause.status === 404) {
        await purgeInventory(inventory.id);
      } else if (cause instanceof SyncHttpError) {
        await restoreInventoryAfterDeletionFailure(inventory.id);
      }
    }
  }
}

export function InventoryHome() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participationCode, setParticipationCode] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    async function loadDashboard(): Promise<void> {
      try {
        const restored = await restoreSession();
        if (!restored) { router.replace("/acesso"); return; }
        await reconcilePendingInventoryDeletions();
        const items = await listOpenInventories();
        if (!active) return;
        setUser(restored); setInventories(items);
      } catch {
        if (active) setError("Não foi possível carregar o painel.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, [router]);

  const labels = useMemo(() => visualLabels(inventories), [inventories]);
  const isTeamAdmin = user?.teams.some((team) => team.role === "ADMIN") ?? false;

  async function handleCreate(): Promise<void> {
    setCreating(true); setError(undefined);
    try { router.push(`/inventarios/${(await createInventory()).id}`); }
    catch { setError("Não foi possível criar o inventário local. Nenhum dado foi salvo."); setCreating(false); }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setJoining(true); setError(undefined);
    try {
      const joined = await joinInventoryByCode(participationCode);
      router.push(`/inventarios/${joined.inventoryId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível participar do inventário.");
      setJoining(false);
    }
  }

  async function signOut(): Promise<void> {
    await logoutAccount();
    router.replace("/acesso");
  }

  if (loading || !user) return <main className="shell"><div className="dashboard-loading" role="status" aria-label="Carregando seu painel"><span /><span /><span /></div></main>;

  return (
    <main className={`shell app-page-shell dashboard-shell ${styles.dashboardShell}`}>
      <AppRail active="home" onCreate={() => void handleCreate()} creating={creating} showTeam={isTeamAdmin} />
      <div className="dashboard-content">
      <header className="dashboard-topbar">
        <Link className="brand-link mobile-dashboard-brand" href="/dashboard" aria-label="INVENTÁRIO, painel"><BrandLogo compact subtitle="Beam Blanks e Blocos" /></Link>
        <div className="account-actions">
          {isTeamAdmin ? <Link className="text-button" href="/equipe">Equipe</Link> : null}
          <span className="user-chip"><span>{firstName(user.displayName).slice(0, 1).toUpperCase()}</span>{user.displayName}</span>
          <button className="text-button" type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </header>

      <section className="dashboard-hero">
        <div><p className="eyebrow">Painel operacional</p><h1>Bem-vindo(a), {firstName(user.displayName)}!</h1><p>Aplicativo de Inventário de Beam Blanks e Blocos</p></div>
        <div className="dashboard-status"><span className="live-dot">Conta verificada</span><small>{user.email}</small></div>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="quick-actions" aria-labelledby="quick-actions-title">
        <div className="section-header"><div><p className="eyebrow">Acesso rápido</p><h2 id="quick-actions-title">O que você precisa fazer?</h2></div></div>
        <div className="action-grid">
          <button className="action-card primary-action" type="button" onClick={() => void handleCreate()} disabled={creating}><span className="action-icon"><Icon name="plus" size={20} /></span><span><strong>{creating ? "Criando…" : "Iniciar novo inventário"}</strong><small>Começar uma nova conferência neste dispositivo</small></span></button>
          <a className="action-card" href="#em-andamento"><span className="action-icon"><Icon name="boxes" size={20} /></span><span><strong>Continuar inventário</strong><small>{inventories.length ? `${inventories.length} em andamento neste dispositivo` : "Nenhum inventário local aberto"}</small></span></a>
          <button className="action-card" type="button" onClick={() => document.getElementById("participar")?.scrollIntoView({ behavior: "smooth" })}><span className="action-icon"><Icon name="users" size={20} /></span><span><strong>Participar de inventário</strong><small>Entrar com um código de seis números</small></span></button>
          <Link className="action-card" href="/historico"><span className="action-icon"><Icon name="file" size={20} /></span><span><strong>Histórico</strong><small>Consultar e exportar inventários finalizados</small></span></Link>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card section-card stack" id="em-andamento" aria-label="Inventários locais abertos">
          <div className="section-header"><div className="section-title"><p className="eyebrow">Em andamento</p><h2>Inventários neste dispositivo</h2><p className="muted">Continue do ponto em que parou. Alterações sem rede permanecem preservadas localmente.</p></div><span className="status-pill">{inventories.length} aberto(s)</span></div>
          {inventories.length === 0 ? <p className="empty-state">Nenhum inventário aberto. Inicie uma nova conferência ou participe com um código.</p> : null}
          <div className="stack">{[...inventories].reverse().map((inventory) => <Link className="card inventory-link inventory-card" href={`/inventarios/${inventory.id}`} key={inventory.id}><div className="inventory-card-main"><strong>{labels.get(inventory.id)}</strong><span className="muted">Atualizado em {new Date(inventory.updatedAt).toLocaleString("pt-BR")}</span><div className="inventory-card-meta"><span className="micro-pill">Aberto</span><span className={`micro-pill ${inventory.syncStatus === "SYNCED" ? "good" : ""}`}>{inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span></div></div><span className="chevron" aria-hidden="true">›</span></Link>)}</div>
        </section>

        <aside className="stack">
          <section className="card section-card panel-card stack" id="participar" aria-labelledby="join-title">
            <div className="panel-heading"><span className="panel-index" aria-hidden="true">06</span><div className="panel-copy"><p className="eyebrow">Trabalho em equipe</p><h2 id="join-title">Participar de inventário</h2><p className="muted">Digite somente o código exibido no dispositivo que iniciou a conferência.</p></div></div>
            <form className="stack" onSubmit={(event) => void handleJoin(event)}><label>Código de participação<input className="code-input" value={participationCode} onChange={(event) => setParticipationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="000000" /></label><button className="primary" type="submit" disabled={joining || participationCode.length !== 6}>{joining ? "Entrando…" : "Participar agora"}</button></form>
            <p className="security-note">O código identifica o inventário aberto. O acesso continua protegido pela sua conta.</p>
          </section>

        <section className="card section-card stack" aria-labelledby="guide-title"><div><p className="eyebrow">Guia rápido</p><h2 id="guide-title">Fluxo do inventário</h2></div><ol className="guide-list"><li><span>1</span><div><strong>Lance os registros</strong><small>Informe lado, vão, lote e quantidade.</small></div></li><li><span>2</span><div><strong>Sincronize a equipe</strong><small>Compartilhe o código de seis números.</small></div></li><li><span>3</span><div><strong>Confira a análise</strong><small>Revise os lotes para conferência.</small></div></li><li><span>4</span><div><strong>Finalize e compartilhe</strong><small>Gere PDF, Excel ou Word.</small></div></li></ol></section>
        </aside>
      </div>
      </div>
    </main>
  );
}
