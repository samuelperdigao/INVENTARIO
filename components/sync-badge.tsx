"use client";

import { useEffect, useState } from "react";

import type { SyncStatus } from "@/lib/models";

import styles from "./sync-badge.module.css";

export type SyncBadgeState = "synced" | "pending" | "offline" | "error" | "finished";

/** Estado exibido a partir do registro local e da conexão do aparelho. */
export function syncBadgeState(status: SyncStatus, finished: boolean, online: boolean): SyncBadgeState {
  if (finished) return "finished";
  if (status === "SYNCED") return "synced";
  if (status === "ERROR") return "error";
  return online ? "pending" : "offline";
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

const labels: Record<SyncBadgeState, string> = {
  synced: "Sincronizado",
  pending: "Falta enviar",
  offline: "Sem internet · salvo no aparelho",
  error: "Erro ao enviar",
  finished: "Finalizado",
};

function CloudIcon({ state }: { state: SyncBadgeState }) {
  const mark = state === "synced" || state === "finished"
    ? <path d="m9.5 13.5 2 2 3.5-3.5" />
    : state === "offline" ? <path d="M3 3l18 18" />
      : state === "error" ? <path d="M12 10.5v3.5M12 16.5v.01" />
        : <path d="M12 11v7M9.5 13.5 12 11l2.5 2.5" />;
  return (
    <svg className={styles.icon} aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18h11a4 4 0 0 0 .7-7.94A6 6 0 0 0 7.2 8.7 4.7 4.7 0 0 0 7 18Z" />
      {mark}
    </svg>
  );
}

interface SyncBadgeProps {
  state: SyncBadgeState;
  /** Horário (HH:mm) da última alteração confirmada; mostrado quando sincronizado. */
  time?: string;
  tone?: "light" | "navy";
}

export function SyncBadge({ state, time, tone = "light" }: SyncBadgeProps) {
  const label = labels[state];
  const showTime = state === "synced" && time;
  return (
    <span className={`${styles.badge} ${styles[tone]} ${styles[state]}`} role="status" aria-label={showTime ? `${label} às ${time}` : label}>
      <CloudIcon state={state} />
      <span aria-hidden="true">{label}{showTime ? <span className={styles.time}> · {time}</span> : null}</span>
    </span>
  );
}
