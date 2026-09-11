"use client";

import { useState } from "react";

import { getAuthenticatedContext } from "@/lib/auth-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";

interface HistoryItem { id: string; date: string; finalizedAt?: string; summary?: { lotsAnalyzed: number; totalPieces?: number }; }

export function HistoryPanel() {
  const [items, setItems] = useState<HistoryItem[]>();
  const [message, setMessage] = useState<string>();

  async function load(): Promise<void> {
    setMessage(undefined);
    try {
      const auth = await getAuthenticatedContext();
      const response = await fetch(`${apiBaseUrl}/api/v1/inventories/history?teamId=${encodeURIComponent(auth.teamId)}`, { credentials: "include", headers: { Authorization: `Bearer ${auth.accessToken}` } });
      if (!response.ok) throw new Error("Não foi possível consultar o histórico.");
      setItems(await response.json() as HistoryItem[]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Não foi possível consultar o histórico."); }
  }

  return <section className="card stack" aria-label="Histórico central">
    <div className="topbar"><div><h2>Histórico</h2><p className="muted">Inventários finalizados da equipe autenticada.</p></div><button className="secondary" type="button" onClick={() => void load()}>Consultar histórico</button></div>
    {message ? <p className="error" role="alert">{message}</p> : null}
    {items?.length === 0 ? <p className="notice">Nenhum inventário finalizado nesta equipe.</p> : null}
    {items?.map((item) => <p key={item.id}><strong>{item.date}</strong> · {item.summary?.lotsAnalyzed ?? 0} lote(s) · finalizado em {item.finalizedAt ? new Date(item.finalizedAt).toLocaleString("pt-BR") : "—"}</p>)}
  </section>;
}
