"use client";

import { useCallback, useState, type MouseEvent } from "react";

import { AnalysisPanel, type AnalysisState } from "@/components/analysis-panel";
import { FinalizationPanel } from "@/components/finalization-panel";
import { SyncPanel } from "@/components/sync-panel";
import type { Inventory, InventoryEntry } from "@/lib/models";
import styles from "@/components/inventory-control-panel.module.css";

interface InventoryControlPanelProps {
  inventory: Inventory;
  entries: InventoryEntry[];
  onChanged: () => Promise<void>;
}

function StageState({ tone, children }: { tone: "good" | "attention" | "neutral"; children: string }) {
  return <span className={`stage-state ${tone}`}>{children}</span>;
}

function StageIcon({ stage }: { stage: "sync" | "analysis" | "finalization" }) {
  if (stage === "sync") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" /></svg>;
  }
  if (stage === "analysis") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><circle cx="19" cy="7" r="1" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export function InventoryControlPanel({ inventory, entries, onChanged }: InventoryControlPanelProps) {
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [openStage, setOpenStage] = useState<"sync" | "analysis" | "finalization" | null>(null);
  const toggleStage = (stage: "sync" | "analysis" | "finalization") => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setOpenStage((current) => current === stage ? null : stage);
  };
  const handleAnalysisStateChange = useCallback((state: AnalysisState) => setAnalysisState(state), []);
  const syncReady = inventory.syncStatus === "SYNCED";
  const analysisReady = analysisState === "ready";
  const finalizationReady = syncReady && (analysisReady || entries.length === 0);

  return (
    <section className={`card section-card inventory-control-panel ${styles.panel}`} aria-label="Controle do inventário">
      <div className={`control-panel-header ${styles.header}`}>
        <div>
          <p className="eyebrow">Etapas de controle</p>
          <h2>Controle do inventário</h2>
          <p className="muted">Sincronize, revise a análise e finalize quando os dados estiverem prontos.</p>
        </div>
        <span className={`control-panel-hint ${styles.hint}`}>Abra uma etapa por vez</span>
      </div>

      <div className={`control-stage-grid ${styles.grid}`}>
        <details className={`control-stage-details ${styles.stage}`} open={openStage === "sync"}>
          <summary className={`control-stage-summary ${styles.summary}`} onClick={toggleStage("sync")}>
            <span className={`control-stage-index ${styles.index}`}><StageIcon stage="sync" /><b>03</b></span>
            <span className="control-stage-summary-copy"><strong>Sincronização</strong><small>Envie os lançamentos e compartilhe o código.</small></span>
            <StageState tone={syncReady ? "good" : "attention"}>{syncReady ? "Concluída" : "Pendente"}</StageState>
            <span className={styles.toggle} aria-hidden="true">{openStage === "sync" ? "−" : "+"}</span>
          </summary>
          <SyncPanel inventory={inventory} onSynced={onChanged} embedded />
        </details>

        <details className={`control-stage-details ${styles.stage}`} open={openStage === "analysis"}>
          <summary className={`control-stage-summary ${styles.summary}`} onClick={toggleStage("analysis")}>
            <span className={`control-stage-index ${styles.index}`}><StageIcon stage="analysis" /><b>04</b></span>
            <span className="control-stage-summary-copy"><strong>Análise</strong><small>Atualize e confira os lotes com atenção.</small></span>
            <StageState tone={analysisState === "ready" ? "good" : analysisState === "attention" ? "attention" : "neutral"}>{analysisState === "ready" ? "Concluída" : analysisState === "attention" ? "Requer atenção" : analysisState === "loading" ? "Atualizando" : "Disponível"}</StageState>
            <span className={styles.toggle} aria-hidden="true">{openStage === "analysis" ? "−" : "+"}</span>
          </summary>
          <AnalysisPanel key={`${inventory.id}:${inventory.revision}`} inventory={inventory} entries={entries} onStateChange={handleAnalysisStateChange} embedded />
        </details>

        <details className={`control-stage-details ${styles.stage}`} open={openStage === "finalization"}>
          <summary className={`control-stage-summary ${styles.summary}`} onClick={toggleStage("finalization")}>
            <span className={`control-stage-index ${styles.index}`}><StageIcon stage="finalization" /><b>05</b></span>
            <span className="control-stage-summary-copy"><strong>Finalização</strong><small>Congele o relatório e gere os arquivos oficiais.</small></span>
            <StageState tone={inventory.status === "FINISHED" ? "good" : finalizationReady ? "good" : "attention"}>{inventory.status === "FINISHED" ? "Concluída" : finalizationReady ? "Disponível" : "Pendente"}</StageState>
            <span className={styles.toggle} aria-hidden="true">{openStage === "finalization" ? "−" : "+"}</span>
          </summary>
          <FinalizationPanel inventory={inventory} onFinished={onChanged} readyForFinalization={finalizationReady} emptyInventory={entries.length === 0} embedded />
        </details>
      </div>
    </section>
  );
}
