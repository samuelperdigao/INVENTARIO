"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import styles from "@/components/admin-panel.module.css";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import {
  adminDownload, adminGet, adminPost, adminUpload,
  type AdminAudit, type AdminDetail, type AdminInventory, type AdminOverview, type AdminReferenceState,
  type AdminPage, type AdminUser, type ReportVersion,
} from "@/lib/admin-client";
import { refreshCurrentUser, restoreSession, type AuthUser } from "@/lib/auth-client";
import { formatBrazilianDate } from "@/lib/local-date";
import { formatSideLabel, INVENTORY_LAYERS, type InventoryEntry } from "@/lib/models";

type Section = "overview" | "inventories" | "deleted" | "audit";
type Action = "create" | "edit" | "remove" | "reopen" | "delete" | "transfer" | "reference" | "removeReference";

const labels: Record<AdminAudit["action"], string> = {
  ENTRY_CREATED: "Lançamento incluído", ENTRY_UPDATED: "Lançamento corrigido",
  ENTRY_REMOVED: "Lançamento removido", REOPENED: "Inventário reaberto",
  INVENTORY_DELETED: "Inventário excluído", OWNER_TRANSFERRED: "Responsável alterado",
  REFERENCE_IMPORTED: "Referência SAP atualizada", REFERENCE_REMOVED: "Referência SAP removida",
};
const actionLabels: Record<Action, string> = {
  create: "Adicionar lançamento", edit: "Corrigir lançamento", remove: "Remover lançamento",
  reopen: "Reabrir inventário", delete: "Excluir inventário", transfer: "Transferir responsabilidade",
  reference: "Importar referência SAP", removeReference: "Remover referência SAP",
};

function dateTime(value?: string): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "Não informado";
}

function statusLabel(item: AdminInventory): string {
  return item.tombstone ? "Excluído" : item.status === "OPEN" ? "Aberto" : "Finalizado";
}

function RecordList({ items }: { items: AdminInventory[] }) {
  return <div className={styles.records}>{items.map((item) =>
    <Link href={`/admin/inventarios/${item.id}`} className={styles.record} key={item.id}>
      <span className={styles.dateBadge}><small>INVENTÁRIO</small><strong>{formatBrazilianDate(item.date)}</strong></span>
      <span className={styles.recordBody}><strong>{item.ownerName || "Responsável não informado"}</strong><small>{item.lotCount} lotes · {item.pieceCount} peças · {item.recordCount} lançamentos</small></span>
      <span className={styles.status}>{statusLabel(item)}</span><span className={styles.chevron} aria-hidden="true">›</span>
    </Link>,
  )}{items.length === 0 ? <p className={styles.empty}>Nenhum inventário encontrado.</p> : null}</div>;
}

export function AdminPanel({ inventoryId }: { inventoryId?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [denied, setDenied] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<AdminOverview>();
  const [listing, setListing] = useState<AdminPage<AdminInventory>>();
  const [detail, setDetail] = useState<AdminDetail>();
  const [audit, setAudit] = useState<AdminPage<AdminAudit>>();
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [comparison, setComparison] = useState<AdminReferenceState>();
  const [referenceSearch, setReferenceSearch] = useState("");
  const [referencePage, setReferencePage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [order, setOrder] = useState("recent");
  const [page, setPage] = useState(1);
  const [entryPage, setEntryPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action>();
  const [selectedEntry, setSelectedEntry] = useState<InventoryEntry>();
  const [side, setSide] = useState<"DE" | "EF">("DE");
  const [bay, setBay] = useState("");
  const [layer, setLayer] = useState("");
  const [lot, setLot] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<{ uniqueLots: number; ignoredRows: number; warnings: string[] }>();
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async (id: string, entriesPage = 1) => {
    const [data, history, reports, reference] = await Promise.all([
      adminGet<AdminDetail>(`/inventories/${id}?page=${entriesPage}`),
      adminGet<AdminPage<AdminAudit>>(`/audit?inventoryId=${id}&page=1`),
      adminGet<ReportVersion[]>(`/inventories/${id}/versions`),
      adminGet<AdminReferenceState>(`/inventories/${id}/reference`),
    ]);
    setDetail(data); setAudit(history); setVersions(reports); setComparison(reference);
  }, []);

  const loadSection = useCallback(async (name: Section, index: number, activityPage = 1) => {
    if (name === "overview") {
      const params = new URLSearchParams();
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      setOverview(await adminGet<AdminOverview>(`/overview?${params}`));
    } else if (name === "audit") {
      setAudit(await adminGet<AdminPage<AdminAudit>>(`/audit?page=${activityPage}`));
    } else {
      const params = new URLSearchParams({ page: String(index), order, deleted: String(name === "deleted") });
      if (search) params.set("query", search);
      if (status) params.set("status", status);
      if (owner) params.set("ownerId", owner);
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      setListing(await adminGet<AdminPage<AdminInventory>>(`/inventories?${params}`));
    }
  }, [from, to, search, status, owner, order]);

  useEffect(() => {
    let live = true;
    void restoreSession().then(async (current) => {
      if (!live) return;
      if (!current) { router.replace("/acesso"); return; }
      try {
        const verified = await refreshCurrentUser();
        if (!live) return;
        setUser(verified);
        if (!verified.systemAdmin) { setDenied(true); setLoading(false); return; }
        if (inventoryId) await loadDetail(inventoryId, entryPage);
        else await loadSection(section, page, auditPage);
        const result = await adminGet<AdminUser[]>("/users");
        if (live) setUsers(result);
      } catch (cause) {
        if (live) {
          if (cause instanceof Error && cause.message.includes("não autorizado")) setDenied(true);
          else setError(cause instanceof Error ? cause.message : "Não foi possível carregar o painel.");
        }
      } finally { if (live) setLoading(false); }
    });
    return () => { live = false; };
    // A carga inicial ocorre uma vez por rota. Filtros e paginação usam loadSection explicitamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryId, router]);

  async function refreshSection(next = section, nextPage = page): Promise<void> {
    setError(""); setLoading(true);
    try { await loadSection(next, nextPage, auditPage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na consulta."); }
    finally { setLoading(false); }
  }

  async function refreshDetail(nextPage = entryPage): Promise<void> {
    if (!inventoryId) return;
    setError(""); setLoading(true);
    try { await loadDetail(inventoryId, nextPage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na consulta."); }
    finally { setLoading(false); }
  }

  async function searchUsers(): Promise<void> {
    setError("");
    try {
      const matches = await adminGet<AdminUser[]>(`/users?query=${encodeURIComponent(userSearch.trim())}`);
      setUsers(matches); setOwner(""); setNewOwner("");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na busca de contas."); }
  }

  function switchSection(next: Section): void {
    setSection(next); setPage(1); setError("");
    void refreshSection(next, 1);
  }

  function openAction(next: Action, entry?: InventoryEntry): void {
    setSelectedEntry(entry);
    setSide(entry?.side ?? "DE"); setBay(entry?.bay ?? ""); setLayer(entry?.layer ?? "");
    setLot(entry?.lot ?? ""); setQuantity(entry?.quantity ?? 1);
    setReason(""); setConfirmation(""); setNewOwner(""); setFile(undefined); setPreview(undefined);
    setError(""); setAction(next);
  }

  async function handlePreview(chosen: File): Promise<void> {
    if (!detail) return;
    setFile(chosen); setPreview(undefined); setError("");
    const form = new FormData(); form.append("file", chosen);
    try { setPreview(await adminUpload(`/inventories/${detail.id}/reference/preview`, form)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao ler a planilha."); }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail || !action || busy) return;
    setBusy(true); setError("");
    const path = `/inventories/${detail.id}`;
    const common = { expectedRevision: detail.revision, expectedGeneration: detail.operationalGeneration, reason: reason.trim() || null };
    try {
      if (action === "create" || action === "edit") {
        const body = { ...common, side, bay: bay.trim(), layer: layer || null, lot: lot.trim(), quantity, duplicateConfirmed: true };
        await adminPost(action === "create" ? `${path}/entries` : `${path}/entries/${selectedEntry?.id}`, body);
      } else if (action === "remove") {
        await adminPost(`${path}/entries/${selectedEntry?.id}/remove`, common);
      } else if (action === "reference") {
        if (!file || !preview?.uniqueLots) throw new Error("Selecione uma planilha válida e confira a prévia.");
        const form = new FormData();
        form.append("file", file); form.append("expectedRevision", String(detail.revision));
        form.append("expectedGeneration", String(detail.operationalGeneration)); form.append("reason", reason.trim());
        await adminUpload(`${path}/reference`, form);
      } else {
        const destination = { reopen: "reopen", delete: "delete", transfer: "transfer", removeReference: "reference/remove" }[action];
        await adminPost(`${path}/${destination}`, {
          ...common, ...(action === "delete" ? { confirmation } : {}),
          ...(action === "transfer" ? { newOwnerUserId: newOwner } : {}),
        });
      }
      setAction(undefined); await refreshDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A operação não foi concluída."); }
    finally { setBusy(false); }
  }

  const nav = <nav className={styles.nav} aria-label="Área administrativa">
    {([
      ["overview", "Visão geral", "chart"], ["inventories", "Todos os inventários", "boxes"],
      ["deleted", "Inventários excluídos", "history"], ["audit", "Histórico de alterações", "file"],
    ] as const).map(([key, title, icon]) => <button key={key} type="button"
      className={section === key && !inventoryId ? styles.active : ""}
      onClick={() => inventoryId ? router.push("/admin") : switchSection(key)}>
      <Icon name={icon} size={18} />{title}</button>)}
  </nav>;

  if (denied) return <main className={styles.denied}><BrandLogo /><h1>Acesso não autorizado</h1>
    <p>Esta conta não tem permissão para acessar a administração global.</p>
    <Link href="/dashboard">Voltar ao painel operacional</Link></main>;
  if (!user) return <main className={styles.denied} role="status">Carregando acesso administrativo…</main>;

  return <main className={styles.shell}>
    <aside className={styles.sidebar}><Link href="/admin" className={styles.logo}><BrandLogo light compact subtitle="Administração" /></Link>
      <p className={styles.sidebarLabel}>CENTRAL DE GESTÃO</p>{nav}
      <Link className={styles.back} href="/dashboard">← Voltar à operação</Link></aside>
    <div className={styles.content}>
      <header className={styles.topbar}><span className={styles.topbarLabel}>INVENTÁRIO <span>/</span> ADMINISTRAÇÃO</span>
        <span className={styles.account}>{user.displayName}</span></header>
      <div className={styles.mobileNav}>{nav}</div>
      {inventoryId ? <div className={styles.heading}><div><Link className={styles.crumb} href="/admin">← Todos os inventários</Link>
        <p className={styles.eyebrow}>DETALHES DO INVENTÁRIO</p>
        <h1>{detail ? `Inventário de ${formatBrazilianDate(detail.date)}` : "Carregando inventário"}</h1>
        <p>Dados centralizados, versões oficiais e ações com histórico.</p></div>
        <button className={styles.secondary} type="button" onClick={() => void refreshDetail()}>Atualizar dados</button></div>
        : <div className={styles.heading}><div><p className={styles.eyebrow}>CENTRAL DE GESTÃO</p>
          <h1>{({ overview: "Visão geral", inventories: "Todos os inventários", deleted: "Inventários excluídos", audit: "Histórico de alterações" })[section]}</h1>
          <p>Consulta dos dados sincronizados no banco central.</p></div>
          <button className={styles.secondary} type="button" onClick={() => void refreshSection()}>Atualizar dados</button></div>}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading && !detail && !overview && !listing && !audit ? <p role="status">Carregando dados…</p> : null}

      {!inventoryId && section === "overview" && overview ? <>
        <div className={styles.filters}><label>De <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Até <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button className={styles.primary} type="button" onClick={() => void refreshSection()}>Aplicar período</button></div>
        <div className={styles.metrics}>{([
          ["Inventários", overview.total, "boxes"], ["Abertos", overview.open, "sync"],
          ["Finalizados", overview.finished, "check"], ["Lotes", overview.lots, "file"], ["Peças", overview.pieces, "chart"],
        ] as const).map(([title, value, icon]) => <div className={styles.metric} key={title}>
          <span className={styles.metricIcon}><Icon name={icon} size={22} /></span><small>{title}</small><strong>{value.toLocaleString("pt-BR")}</strong>
        </div>)}</div>
        <div className={styles.twoColumns}><section className={styles.card}><h2>Inventários recentes</h2><RecordList items={overview.recent} /></section>
          <section className={styles.card}><h2>Atividade administrativa</h2><ActivityList items={overview.activities} />
            <h3>Inventários por mês</h3><div className={styles.periods}>{overview.byPeriod.slice(-8).map((period) =>
              <div key={period.period}><span>{period.period}</span><strong>{period.count}</strong></div>)}</div></section></div>
      </> : null}

      {!inventoryId && (section === "inventories" || section === "deleted") ? <section className={styles.card}>
        <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setPage(1); void refreshSection(section, 1); }}>
          <label>Pesquisa <input value={search} placeholder="Responsável, lote ou data" onChange={(event) => setSearch(event.target.value)} /></label>
          <label>Situação <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas</option><option value="OPEN">Aberto</option><option value="FINISHED">Finalizado</option></select></label>
          <label>Buscar responsável <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Nome ou e-mail" /></label>
          <button className={styles.secondary} type="button" onClick={() => void searchUsers()}>Buscar contas</button>
          <label>Responsável <select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">Todos</option>
            {users.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>De <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Até <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Ordenar <select value={order} onChange={(event) => setOrder(event.target.value)}><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="date">Data decrescente</option><option value="dateAsc">Data crescente</option></select></label>
          <button className={styles.primary} type="submit">Pesquisar</button>
        </form>
        <div className={styles.sectionTitle}><h2>Resultados</h2><span>{listing?.total ?? 0} inventários</span></div>
        <RecordList items={listing?.items ?? []} />
        <Pagination page={page} total={listing?.total ?? 0} size={25} onChange={(next) => { setPage(next); void refreshSection(section, next); }} />
      </section> : null}

      {!inventoryId && section === "audit" ? <section className={styles.card}><h2>Alterações registradas</h2>
        <ActivityList items={audit?.items ?? []} />
        <Pagination page={auditPage} total={audit?.total ?? 0} size={25} onChange={(next) => {
          setAuditPage(next); setLoading(true);
          void adminGet<AdminPage<AdminAudit>>(`/audit?page=${next}`).then(setAudit).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
        }} /></section> : null}

      {inventoryId && detail ? <>
        <div className={styles.detailHero}><div><span className={styles.status}>{statusLabel(detail)}</span>
          <h2>{detail.ownerName || "Responsável não informado"}</h2><p>{detail.ownerEmail || "Sem e-mail registrado"}</p>
          <small>Ciclo {detail.operationalGeneration} · Revisão {detail.revision} · {detail.recordCount} lançamentos</small></div>
          <div className={styles.detailTotals}><div><strong>{detail.lotCount}</strong><span>lotes</span></div><div><strong>{detail.pieceCount}</strong><span>peças</span></div></div></div>
        <section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>REGISTROS FÍSICOS</p><h2>Lançamentos</h2></div>
          {!detail.tombstone ? <button className={styles.primary} type="button" onClick={() => openAction("create")}>+ Adicionar</button> : null}</div>
          <div className={styles.entries}>{detail.entries.map((entry) => <div className={styles.entry} key={entry.id}>
            <span className={styles.side}>{formatSideLabel(entry.side)}</span><div><strong>{entry.lot}</strong>
              <small>Vão {entry.bay}{entry.layer ? ` · Camada ${entry.layer}` : ""} · {entry.createdByName || "Autor não informado"}</small></div>
            <strong>{entry.quantity} peça(s)</strong>{!detail.tombstone ? <div className={styles.inlineActions}>
              <button type="button" onClick={() => openAction("edit", entry)}>Corrigir</button>
              <button type="button" onClick={() => openAction("remove", entry)}>Remover</button></div> : null}
          </div>)}</div>
          {detail.entries.length === 0 ? <p className={styles.empty}>Nenhum lançamento neste inventário.</p> : null}
          <Pagination page={entryPage} total={detail.entryTotal} size={detail.entryPageSize} onChange={(next) => {
            setEntryPage(next); void refreshDetail(next);
          }} />
        </section>
        <div className={styles.twoColumns}><section className={styles.card}><div className={styles.sectionTitle}><h2>Referência SAP</h2>
          {!detail.tombstone ? <button className={styles.secondary} type="button" onClick={() => openAction("reference")}>{detail.reference.reference ? "Substituir" : "Importar"}</button> : null}</div>
          {detail.reference.reference ? <><p><strong>{detail.reference.reference.originalFilename}</strong></p>
            <p>{detail.reference.summary.totalLots} lotes previstos · {detail.reference.summary.foundLots} encontrados · {detail.reference.summary.pendingLots} pendentes</p>
            <p>{detail.reference.summary.outsideReferenceLots} lote(s) físicos fora da referência</p>
            <form className={styles.filters} onSubmit={(event) => {
              event.preventDefault(); setReferencePage(1);
              void adminGet<AdminReferenceState>(`/inventories/${detail.id}/reference?query=${encodeURIComponent(referenceSearch)}&page=1`)
                .then(setComparison).catch((cause: Error) => setError(cause.message));
            }}><label>Buscar lote <input value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} placeholder="Número do lote" /></label>
              <button type="submit" className={styles.secondary}>Buscar</button></form>
            <div className={styles.referenceList}>{comparison?.lots.map((lot) => <div key={lot.lotNumber}>
              <strong>{lot.lotNumber}</strong><span>{lot.foundPhysically ? `Encontrado · ${lot.physicalQuantity} peça(s)` : "Pendente no físico"}</span>
            </div>)}{comparison?.outsideLots.map((lot) => <div key={lot.lotNumber}>
              <strong>{lot.lotNumber}</strong><span>Fora da referência · {lot.physicalQuantity} peça(s)</span>
            </div>)}</div>
            <Pagination page={referencePage} total={comparison?.totalMatchingLots ?? 0} size={50} onChange={(next) => {
              setReferencePage(next);
              void adminGet<AdminReferenceState>(`/inventories/${detail.id}/reference?query=${encodeURIComponent(referenceSearch)}&page=${next}`)
                .then(setComparison).catch((cause: Error) => setError(cause.message));
            }} />
            {!detail.tombstone ? <button className={styles.textButton} type="button" onClick={() => openAction("removeReference")}>Remover referência</button> : null}</> : <p className={styles.empty}>Sem referência SAP ativa.</p>}</section>
          <section className={styles.card}><h2>Participantes</h2>
            <p>{detail.participants.length} participante(s) registrado(s)</p>
            {detail.participants.map((person) => <p key={person.email}><strong>{person.name}</strong><br /><small>{person.email}</small></p>)}</section></div>
        <section className={styles.card}><div className={styles.sectionTitle}><div><p className={styles.eyebrow}>RELATÓRIOS OFICIAIS</p><h2>Exportações e versões</h2></div></div>
          <div className={styles.reportRow}><strong>Versão atual{detail.reportVersion ? ` · v${detail.reportVersion}` : ""}</strong>
            <ExportButtons onDownload={(format) => adminDownload(detail.id, format)} /></div>
          {versions.map((version) => <div className={styles.reportRow} key={version.version}>
            <span>Versão {version.version} · {dateTime(version.createdAt)}</span>
            <ExportButtons onDownload={(format) => adminDownload(detail.id, format, version.version)} /></div>)}
        </section>
        <div className={styles.twoColumns}><section className={styles.card}><h2>Administração</h2>
          <div className={styles.actionGrid}>{!detail.tombstone ? <>
            {detail.status === "FINISHED" ? <button type="button" onClick={() => openAction("reopen")}>Reabrir inventário</button> : null}
            <button type="button" onClick={() => openAction("transfer")}>Transferir responsável</button>
            <button className={styles.danger} type="button" onClick={() => openAction("delete")}>Excluir inventário</button>
          </> : <p className={styles.empty}>Este inventário foi excluído e permanece disponível para auditoria.</p>}</div></section>
          <section className={styles.card}><h2>Histórico de alterações</h2><ActivityList items={audit?.items ?? []} /></section></div>
      </> : null}
    </div>

    {action && detail ? <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setAction(undefined); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="admin-action-title">
        <form onSubmit={(event) => void submitAction(event)}>
          <div className={styles.modalHead}><div><p className={styles.eyebrow}>AÇÃO ADMINISTRATIVA</p><h2 id="admin-action-title">{actionLabels[action]}</h2></div>
            <button type="button" aria-label="Fechar" onClick={() => setAction(undefined)} disabled={busy}>×</button></div>
          {(action === "create" || action === "edit") ? <div className={styles.formGrid}>
            <label>Lado <select value={side} onChange={(event) => setSide(event.target.value as "DE" | "EF")}><option value="DE">LP</option><option value="EF">LE</option></select></label>
            <label>Vão <input required maxLength={100} value={bay} onChange={(event) => setBay(event.target.value)} /></label>
            <label>Camada <select value={layer} onChange={(event) => setLayer(event.target.value)}><option value="">Sem camada</option>{INVENTORY_LAYERS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Lote <input required inputMode="numeric" minLength={10} maxLength={10} pattern="(27|28)[0-9]{8}" value={lot} onChange={(event) => setLot(event.target.value)} /></label>
            <label>Quantidade de peças <input required type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          </div> : null}
          {action === "transfer" ? <><label>Buscar novo responsável <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Nome ou e-mail" /></label>
            <button className={styles.secondary} type="button" onClick={() => void searchUsers()}>Buscar contas</button>
            <label>Novo responsável <select required value={newOwner} onChange={(event) => setNewOwner(event.target.value)}><option value="">Selecione uma conta</option>{users.filter((candidate) => candidate.id !== detail.ownerUserId).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name} · {candidate.email}</option>)}</select></label></> : null}
          {action === "reference" ? <><label>Planilha SAP (.xlsx) <input required type="file" accept=".xlsx" onChange={(event) => { const chosen = event.target.files?.[0]; if (chosen) void handlePreview(chosen); }} /></label>
            {preview ? <p className={styles.notice}>Prévia: {preview.uniqueLots} lote(s) válido(s), {preview.ignoredRows} linha(s) ignorada(s). {preview.warnings.slice(0, 2).join(" ")}</p> : null}</> : null}
          <label>Justificativa {detail.status === "OPEN" && (action === "create" || action === "edit" || action === "remove") ? "(opcional)" : ""}
            <textarea required={detail.status === "FINISHED" || !["create", "edit", "remove"].includes(action)}
              minLength={8} maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)}
              placeholder="Descreva o motivo desta alteração" /></label>
          {action === "delete" ? <label>Digite EXCLUIR INVENTÁRIO para confirmar <input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.modalActions}><button className={styles.secondary} type="button" onClick={() => setAction(undefined)} disabled={busy}>Cancelar</button>
            <button className={action === "delete" ? styles.danger : styles.primary} disabled={busy || (action === "reference" && !preview?.uniqueLots) || (action === "delete" && confirmation !== "EXCLUIR INVENTÁRIO")} type="submit">
              {busy ? "Salvando…" : "Confirmar alteração"}</button></div>
        </form>
      </section>
    </div> : null}
  </main>;
}

function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (next: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return pages > 1 ? <div className={styles.pagination}><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
    <span>Página {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</button></div> : null;
}

function ActivityList({ items }: { items: AdminAudit[] }) {
  return <div className={styles.activities}>{items.map((item) => <div className={styles.activity} key={item.id}><span className={styles.activityDot} />
    <div><strong>{labels[item.action] || item.action}</strong><p>{item.actorName} · {dateTime(item.createdAt)}</p>
      {item.reason ? <small>Motivo: {item.reason}</small> : null}
      {item.reportVersion ? <small>Versão do relatório: {item.reportVersion}</small> : null}</div></div>)}
    {items.length === 0 ? <p className={styles.empty}>Nenhuma alteração administrativa registrada.</p> : null}</div>;
}

function ExportButtons({ onDownload }: { onDownload: (format: "xls" | "xlsx" | "pdf" | "docx") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <div className={styles.exportButtons}>{(["xls", "xlsx", "pdf", "docx"] as const).map((format) =>
    <button type="button" disabled={busy} key={format} onClick={() => {
      setBusy(true); void onDownload(format).finally(() => setBusy(false));
    }}>{format.toUpperCase()}</button>)}</div>;
}
