"use client";

import { useCallback, useState } from "react";

import { AnalysisPanel, type AnalysisState } from "@/components/analysis-panel";
import { FinalizationPanel } from "@/components/finalization-panel";
import { SyncPanel } from "@/components/sync-panel";
import type { Inventory, InventoryEntry } from "@/lib/models";

interface InventoryControlPanelProps {
  inventory: Inventory;
  entries: InventoryEntry[];
  onChanged: () => Promise<void>;
}

function StageState({ tone, children }: { tone: "good" | "attention" | "neutral"; children: string }) {
  return <span className={`stage-state ${tone}`}>{children}</span>;
}

export function InventoryControlPanel({ inventory, entries, onChanged }: InventoryControlPanelProps) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const handleAnalysisStateChange = useCallback((state: AnalysisState) => setAnalysisState(state), []);
  const syncReady = inventory.syncStatus === "SYNCED";
  const analysisReady = analysisState === "ready";
  const finalizationReady = syncReady && (analysisReady || entries.length === 0);

  return (
    <section className="card section-card inventory-control-panel" aria-label="Controle do inventário">
      <div className="control-panel-header">
        <div>
          <p className="eyebrow">Etapas de controle</p>
          <h2>Controle do inventário</h2>
          <p className="muted">Sincronize, revise a análise e finalize quando os dados estiverem prontos.</p>
        </div>
        <span className="control-panel-hint">Uma etapa por vez</span>
      </div>

      <div className="control-stage-grid">
        <details className="control-stage-details" open>
          <summary className="control-stage-summary">
            <span className="control-stage-index">03</span>
            <span className="control-stage-summary-copy"><strong>Sincronização</strong><small>Envie os lançamentos e compartilhe o código.</small></span>
            <StageState tone={syncReady ? "good" : "attention"}>{syncReady ? "Concluída" : "Pendente"}</StageState>
          </summary>
          <SyncPanel inventory={inventory} onSynced={onChanged} embedded />
        </details>

        <details className="control-stage-details" open>
          <summary className="control-stage-summary">
            <span className="control-stage-index">04</span>
            <span className="control-stage-summary-copy"><strong>Análise</strong><small>Atualize e confira os lotes com atenção.</small></span>
            <StageState tone={analysisState === "ready" ? "good" : analysisState === "attention" ? "attention" : "neutral"}>{analysisState === "ready" ? "Concluída" : analysisState === "attention" ? "Requer atenção" : analysisState === "loading" ? "Atualizando" : "Disponível"}</StageState>
          </summary>
          <AnalysisPanel key={`${inventory.id}:${inventory.revision}`} inventory={inventory} entries={entries} onStateChange={handleAnalysisStateChange} embedded />
        </details>

        <details className="control-stage-details" open>
          <summary className="control-stage-summary">
            <span className="control-stage-index">05</span>
            <span className="control-stage-summary-copy"><strong>Finalização</strong><small>Congele o relatório e gere os arquivos oficiais.</small></span>
            <StageState tone={inventory.status === "FINISHED" ? "good" : finalizationReady ? "good" : "attention"}>{inventory.status === "FINISHED" ? "Concluída" : finalizationReady ? "Disponível" : "Pendente"}</StageState>
          </summary>
          <FinalizationPanel inventory={inventory} onFinished={onChanged} readyForFinalization={finalizationReady} emptyInventory={entries.length === 0} embedded />
        </details>
      </div>
    </section>
  );
}
