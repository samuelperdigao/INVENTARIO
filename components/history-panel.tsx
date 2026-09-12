"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getAuthenticatedContext, getAuthenticatedSession, restoreSession, type AuthUser } from "@/lib/auth-client";
import { formatBrazilianDate } from "@/lib/local-date";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

export interface HistoryItem {
  id: string;
  date: string;
  finalizedAt?: string;
  createdByName?: string;
  finalizedByName?: string;
  summary?: { lotsAnalyzed: number; totalPieces?: number; fragmentedLots: number; reviewItems: number };
}

export function HistoryPanel({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [items, setItems] = useState<HistoryItem[]>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();

  const load = useCallback(async (selectedScope: "mine" | "team") => {
    setLoading(true); setMessage(undefined);
    try {
      const session = await getAuthenticatedSession();
      const context = await getAuthenticatedContext();
      if (selectedScope === "team" && !context.teamId) {
        setItems([]); setMessage("Sua conta ainda não está associada a uma equipe."); return;
      }
      const query = selectedScope === "team" ? `scope=team&teamId=${encodeURIComponent(context.teamId)}` : "scope=mine";
      const response = await fetch(`${apiBaseUrl}/api/v1/inventories/history?${query}`, { credentials: "include", headers: { Authorization: `Bearer ${session.accessToken}` } });
      const body = await response.json().catch(() => undefined) as HistoryItem[] | { detail?: string } | undefined;
      if (!response.ok || !Array.isArray(body)) throw new Error(!Array.isArray(body) ? body?.detail : undefined);
      setItems(body);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível consultar o histórico."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void restoreSession().then((restored) => {
      if (!active) return;
      if (!restored) { router.replace("/acesso"); return; }
      setUser(restored); void load("mine");
    });
    return () => { active = false; };
  }, [load, router]);

  function selectScope(next: "mine" | "team"): void {
    setScope(next); void load(next);
  }

  const content = <section className="card section-card stack history-card" aria-label="Histórico central">
    <div className="section-header"><div><p className="eyebrow">Consulta central</p><h2>Inventários finalizados</h2><p className="muted">Abra o relatório oficial em modo somente leitura e exporte novamente quando precisar.</p></div><span className="status-pill">{items?.length ?? 0} resultado(s)</span></div>
    <div className="segmented-control" role="tablist" aria-label="Escopo do histórico"><button type="button" role="tab" aria-selected={scope === "mine"} onClick={() => selectScope("mine")}>Meus inventários</button><button type="button" role="tab" aria-selected={scope === "team"} onClick={() => selectScope("team")}>Inventários da equipe</button></div>
    {loading ? <p className="muted">Carregando histórico…</p> : null}
    {message ? <p className={message.startsWith("Sua conta") ? "notice" : "error"} role="status">{message}</p> : null}
    {!loading && items?.length === 0 && !message ? <p className="empty-state">Nenhum inventário finalizado neste histórico.</p> : null}
    <div className="history-list">{items?.map((item) => <Link className="history-row" href={`/historico/${item.id}`} key={item.id}><div className="history-date"><span>{formatBrazilianDate(item.date)}</span><small>Finalizado em {item.finalizedAt ? new Date(item.finalizedAt).toLocaleString("pt-BR") : "data não informada"}</small></div><div className="inventory-card-meta"><span className="micro-pill">{item.summary?.lotsAnalyzed ?? 0} lote(s)</span><span className="micro-pill">{item.summary?.fragmentedLots ?? 0} fragmentado(s)</span></div><span className="chevron" aria-hidden="true">›</span></Link>)}</div>
  </section>;

  if (!standalone) return content;
  return <main className="shell"><header className="page-topbar"><Link className="back-link" href="/dashboard">‹ Voltar ao painel</Link><div><p className="eyebrow">Arquivo central</p><h1>Histórico de inventários</h1><p className="muted">{user ? `Consulta autorizada para ${user.displayName}` : "Carregando conta…"}</p></div></header>{content}</main>;
}
