"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatBrazilianDate } from "@/lib/local-date";
import { createInventory, listOpenInventories } from "@/lib/inventory-repository";
import { connectRemoteInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";
import { AuthPanel } from "@/components/auth-panel";
import { HistoryPanel } from "@/components/history-panel";

function visualLabels(inventories: Inventory[]): Map<string, string> {
  const occurrences = new Map<string, number>();
  return new Map(inventories.map((inventory) => {
    const number = (occurrences.get(inventory.date) ?? 0) + 1;
    occurrences.set(inventory.date, number);
    const suffix = number > 1 ? ` #${number}` : "";
    return [inventory.id, `Inventário ${formatBrazilianDate(inventory.date)}${suffix}`];
  }));
}

export function InventoryHome() {
  const router = useRouter();
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [remoteInventoryId, setRemoteInventoryId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void listOpenInventories()
      .then((items) => { if (active) setInventories(items); })
      .catch(() => { if (active) setError("Não foi possível ler os inventários locais."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const labels = useMemo(() => visualLabels(inventories), [inventories]);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    setError(undefined);
    try {
      const inventory = await createInventory();
      router.push(`/inventarios/${inventory.id}`);
    } catch {
      setError("Não foi possível criar o inventário local. Nenhum inventário foi salvo.");
      setCreating(false);
    }
  }

  async function handleConnect(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setConnecting(true);
    setError(undefined);
    try {
      await connectRemoteInventory(remoteInventoryId.trim(), accessCode.trim());
      router.push(`/inventarios/${remoteInventoryId.trim()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conectar o inventário.");
      setConnecting(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="inventory-title">
        <div className="hero-copy">
          <div className="app-brand">
            <div className="brand-mark" aria-hidden="true">IN</div>
            <div>
              <p className="eyebrow">Controle operacional</p>
              <h1 id="inventory-title">Inventários</h1>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>Registre os lotes com rapidez. Os lançamentos continuam disponíveis mesmo sem conexão.</p>
        </div>
        <div className="hero-actions">
          <button className="primary" type="button" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? "Criando…" : "Iniciar inventário"}
          </button>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="home-grid">
        <div className="stack">
          <section className="card section-card stack" aria-label="Inventários locais abertos">
            <div className="section-header">
              <div className="section-title">
                <p className="eyebrow">Em andamento</p>
                <h2>Inventários neste dispositivo</h2>
                <p className="muted">Continue de onde parou, inclusive offline.</p>
              </div>
              {!loading ? <span className="status-pill">{inventories.length} aberto(s)</span> : null}
            </div>

            {loading ? <p className="muted">Carregando inventários locais…</p> : null}
            {!loading && inventories.length === 0 ? <p className="notice">Nenhum inventário aberto neste dispositivo.</p> : null}

            <div className="stack">
              {[...inventories].reverse().map((inventory) => (
                <Link className="card inventory-link inventory-card" href={`/inventarios/${inventory.id}`} key={inventory.id}>
                  <div className="inventory-card-main">
                    <strong>{labels.get(inventory.id)}</strong>
                    <span className="muted">Aberto · {inventory.revision - 1} alteração(ões)</span>
                  </div>
                  <span className="chevron" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </section>

          <HistoryPanel />
        </div>

        <aside className="stack" aria-label="Acesso e conexão">
          <AuthPanel />
          <section className="card section-card stack" aria-label="Conectar inventário">
            <div className="section-title">
              <p className="eyebrow">Outro dispositivo</p>
              <h2>Conectar inventário</h2>
              <p className="muted">Use o ID e o código de sincronização recebidos do dispositivo que iniciou o inventário.</p>
            </div>
            <form className="stack" onSubmit={(event) => void handleConnect(event)}>
              <label>ID do inventário
                <input value={remoteInventoryId} onChange={(event) => setRemoteInventoryId(event.target.value)} required />
              </label>
              <label>Código de sincronização
                <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required />
              </label>
              <button className="secondary" type="submit" disabled={connecting}>{connecting ? "Conectando…" : "Conectar inventário"}</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
