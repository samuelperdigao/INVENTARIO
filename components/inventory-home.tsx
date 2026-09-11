"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatBrazilianDate } from "@/lib/local-date";
import { createInventory, listOpenInventories } from "@/lib/inventory-repository";
import { connectRemoteInventory } from "@/lib/sync-client";
import type { Inventory } from "@/lib/models";
import { AuthPanel } from "@/components/auth-panel";

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
      <div className="topbar">
        <div>
          <h1>Inventários</h1>
          <p className="muted">Lançamentos funcionam offline neste dispositivo.</p>
        </div>
        <button className="primary" type="button" onClick={() => void handleCreate()} disabled={creating}>
          {creating ? "Criando…" : "Iniciar inventário"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p className="muted">Carregando inventários locais…</p> : null}
      {!loading && inventories.length === 0 ? <p className="notice">Nenhum inventário aberto neste dispositivo.</p> : null}
      <section className="stack" aria-label="Inventários locais abertos">
        {[...inventories].reverse().map((inventory) => (
          <Link className="card inventory-link" href={`/inventarios/${inventory.id}`} key={inventory.id}>
            <strong>{labels.get(inventory.id)}</strong>
            <span className="muted"> Aberto · {inventory.revision - 1} alteração(ões)</span>
          </Link>
        ))}
      </section>
      <AuthPanel />
      <section className="card stack" aria-label="Conectar inventário">
        <div><h2>Conectar outro dispositivo</h2><p className="muted">Informe o ID e o código de sincronização recebidos do dispositivo que criou o inventário.</p></div>
        <form className="stack" onSubmit={(event) => void handleConnect(event)}>
          <label>ID do inventário<input value={remoteInventoryId} onChange={(event) => setRemoteInventoryId(event.target.value)} required /></label>
          <label>Código de sincronização<input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required /></label>
          <button className="secondary" type="submit" disabled={connecting}>{connecting ? "Conectando…" : "Conectar inventário"}</button>
        </form>
      </section>
    </main>
  );
}
