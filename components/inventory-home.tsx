 "use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import styles from "@/components/inventory-home.module.css";
import { AppRail } from "@/components/app-rail";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { logoutAccount, restoreSession, type AuthUser } from "@/lib/auth-client";
import { assignedInventories, type AssignedInventory } from "@/lib/admin-client";
import { createInventory, listOpenInventories, listPendingInventoryDeletions, purgeInventory, restoreInventoryAfterDeletionFailure } from "@/lib/inventory-repository";
import { formatBrazilianDate } from "@/lib/local-date";
import type { Inventory } from "@/lib/models";
import { SyncHttpError, connectAssignedInventory, joinInventoryByCode, syncInventory } from "@/lib/sync-client";

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
  const [assigned, setAssigned] = useState<AssignedInventory[]>([]);
  const [openingAssigned, setOpeningAssigned] = useState<string>();
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
        void assignedInventories().then((data) => { if (active) setAssigned(data.filter((item) => item.status === "OPEN")); }).catch(() => undefined);
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

  async function openAssigned(item: AssignedInventory): Promise<void> {
    setOpeningAssigned(item.inventoryId); setError(undefined);
    try {
      await connectAssignedInventory(item.inventoryId, item.accessToken);
      router.push(`/inventarios/${item.inventoryId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o inventário atribuído.");
      setOpeningAssigned(undefined);
    }
  }

  if (loading || !user) return <main className="shell"><div className="dashboard-loading" role="status" aria-label="Carregando seu painel"><span /><span /><span /></div></main>;

  return (
    <main className={`shell app-page-shell dashboard-shell ${styles.dashboardShell}`}>
      <AppRail active="home" onCreate={() => void handleCreate()} creating={creating} showTeam={isTeamAdmin} showAdmin={user.systemAdmin} />
      <div className="dashboard-content">
      <header className="dashboard-topbar">
        <div className={styles.topbarContext}>
          <span>ÁREA DE TRABALHO</span>
          <strong>Painel operacional</strong>
        </div>
        <Link className="brand-link mobile-dashboard-brand" href="/dashboard" aria-label="INVENTÁRIO, painel"><BrandLogo compact subtitle="Beam Blanks e Blocos" /></Link>
        <div className="account-actions">
          {isTeamAdmin ? <Link className="text-button" href="/equipe">Equipe</Link> : null}
          <span className="user-chip"><span>{firstName(user.displayName).slice(0, 1).toUpperCase()}</span>{user.displayName}</span>
          <button className="text-button" type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </header>

      <section className={`dashboard-hero ${styles.hero}`}>
        <div className={styles.heroIntro}>
          <p className="eyebrow"><span className={styles.heroMobileCopy}>Painel operacional</span><span className={styles.heroDesktopCopy}>Beam Blanks e Blocos</span></p>
          <h1>Bem-vindo(a), {firstName(user.displayName)}!</h1>
          <p><span className={styles.heroMobileCopy}>Aplicativo de Inventário de Beam Blanks e Blocos</span><span className={styles.heroDesktopCopy}>Aplicativo de Inventário da Laminação de Perfis</span></p>
        </div>
        <div className={styles.heroActions}>
          <div className="dashboard-status"><span className="live-dot">Conta verificada</span><small>{user.email}</small></div>
          <button className={`primary ${styles.heroAction}`} type="button" onClick={() => void handleCreate()} disabled={creating}>
            <Icon name="plus" size={18} />
            <span>{creating ? "Criando inventário…" : "Iniciar novo inventário"}</span>
          </button>
        </div>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {assigned.length > 0 ? <section className={`card section-card stack ${styles.assignedSection}`} aria-label="Inventários atribuídos">
        <div className="section-header"><div><p className="eyebrow">Responsabilidade atribuída</p><h2>Inventários recebidos</h2>
          <p className="muted">Abra o inventário para sincronizar os dados centrais neste dispositivo.</p></div></div>
        <div className={`stack ${styles.assignedList}`}>
          {assigned.map((item) => <div className="card inventory-card" key={item.inventoryId}>
            <strong>Inventário de {formatBrazilianDate(item.date)}</strong>
            <button className="secondary" type="button" disabled={openingAssigned === item.inventoryId} onClick={() => void openAssigned(item)}>
              {openingAssigned === item.inventoryId ? "Abrindo…" : "Abrir inventário"}</button></div>)}
        </div>
      </section> : null}

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
        <section className={`card section-card stack ${styles.recordsPanel}`} id="em-andamento" aria-label="Inventários locais abertos">
          <div className="section-header"><div className="section-title"><p className="eyebrow">Em andamento</p><h2>Inventários neste dispositivo</h2><p className="muted">Continue do ponto em que parou. Alterações sem rede permanecem preservadas localmente.</p></div><span className="status-pill"><span className={styles.mobileCount}>{inventories.length} aberto(s)</span><span className={styles.desktopCount}>{inventories.length} {inventories.length === 1 ? "aberto" : "abertos"}</span></span></div>
          {inventories.length === 0 ? <>
            <p className={`empty-state ${styles.emptyMobile}`}>Nenhum inventário aberto. Inicie uma nova conferência ou participe com um código.</p>
            <div className={styles.emptyWorkspace}>
              <span className={styles.emptyIcon} aria-hidden="true"><Icon name="boxes" size={21} /></span>
              <div className={styles.emptyCopy}>
                <strong>Nenhum inventário em andamento</strong>
                <p>Quando você criar ou abrir uma conferência, ela aparecerá aqui.</p>
              </div>
              <button className={`secondary ${styles.emptyAction}`} type="button" onClick={() => void handleCreate()} disabled={creating}>
                {creating ? "Criando…" : "Criar inventário"}
              </button>
            </div>
          </> : null}
          <div className={`stack ${styles.inventoryList}`}>{[...inventories].reverse().map((inventory) => <Link className="card inventory-link inventory-card" href={`/inventarios/${inventory.id}`} key={inventory.id}><div className="inventory-card-main"><strong>{labels.get(inventory.id)}</strong><span className="muted">Atualizado em {new Date(inventory.updatedAt).toLocaleString("pt-BR")}</span><div className="inventory-card-meta"><span className="micro-pill">Aberto</span><span className={`micro-pill ${inventory.syncStatus === "SYNCED" ? "good" : ""}`}>{inventory.syncStatus === "SYNCED" ? "Sincronizado" : "Salvo localmente"}</span></div></div><span className="chevron" aria-hidden="true">›</span></Link>)}</div>
        </section>

        <aside className={`stack ${styles.supportColumn}`}>
          <section className={`card section-card panel-card stack ${styles.participationPanel}`} id="participar" aria-labelledby="join-title">
            <div className="panel-heading"><span className="panel-index" aria-hidden="true">06</span><div className="panel-copy"><p className="eyebrow">Trabalho em equipe</p><h2 id="join-title">Participar de inventário</h2><p className="muted">Digite somente o código exibido no dispositivo que iniciou a conferência.</p></div></div>
            <form className="stack" onSubmit={(event) => void handleJoin(event)}><label>Código de participação<input className="code-input" value={participationCode} onChange={(event) => setParticipationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="000000" /></label><button className="primary" type="submit" disabled={joining || participationCode.length !== 6}>{joining ? "Entrando…" : "Participar agora"}</button></form>
            <p className="security-note">O código identifica o inventário aberto. O acesso continua protegido pela sua conta.</p>
          </section>

        </aside>
      </div>
      </div>
    </main>
  );
}
