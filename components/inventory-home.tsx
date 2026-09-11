"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatBrazilianDate } from "@/lib/local-date";
import { createInventory, listOpenInventories } from "@/lib/inventory-repository";
import type { Inventory } from "@/lib/models";

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

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <h1>Inventários</h1>
          <p className="muted">Lançamentos ficam neste dispositivo.</p>
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
    </main>
  );
}

