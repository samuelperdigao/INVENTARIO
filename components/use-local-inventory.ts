"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getCurrentUser, restoreSession } from "@/lib/auth-client";
import { getInventory, listActiveEntries } from "@/lib/inventory-repository";
import type { Inventory, InventoryEntry } from "@/lib/models";

interface LocalInventoryState {
  inventory?: Inventory;
  entries: InventoryEntry[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

export function useLocalInventory(inventoryId: string): LocalInventoryState {
  const router = useRouter();
  const [inventory, setInventory] = useState<Inventory>();
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (): Promise<{ inventory: Inventory; entries: InventoryEntry[] } | undefined> => {
    const currentUser = getCurrentUser() ?? await restoreSession();
    if (!currentUser) {
      router.replace("/acesso");
      return undefined;
    }

    const [currentInventory, currentEntries] = await Promise.all([
      getInventory(inventoryId, currentUser.id),
      listActiveEntries(inventoryId),
    ]);
    if (!currentInventory) throw new Error("Inventário não encontrado neste dispositivo.");
    return { inventory: currentInventory, entries: currentEntries };
  }, [inventoryId, router]);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await load();
    if (!result) return;
    setInventory(result.inventory);
    setEntries(result.entries);
  }, [load]);

  useEffect(() => {
    let active = true;
    void load()
      .then((result) => {
        if (!active || !result) return;
        setInventory(result.inventory);
        setEntries(result.entries);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o inventário.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load]);

  return { inventory, entries, loading, error, refresh };
}
