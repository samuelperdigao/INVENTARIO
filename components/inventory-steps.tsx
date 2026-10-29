import styles from "./inventory-steps.module.css";

export type StepState = "current" | "done" | "available" | "pending" | "locked";

export interface InventoryStep {
  label: string;
  state: StepState;
  /** Explica o estado em palavras (nunca só cor). */
  detail: string;
}

interface StepInput {
  entries: number;
  synced: boolean;
  finished: boolean;
}

/** Deriva as cinco etapas a partir do estado local do inventário. */
export function deriveInventorySteps({ entries, synced, finished }: StepInput): InventoryStep[] {
  if (finished) {
    return ["Lançar", "Conferir", "Sincronizar", "Analisar", "Finalizar"].map((label) => ({ label, state: "done", detail: "Concluída" }));
  }
  const hasEntries = entries > 0;
  return [
    hasEntries ? { label: "Lançar", state: "done", detail: `${entries} ${entries === 1 ? "registro" : "registros"}` } : { label: "Lançar", state: "current", detail: "Em andamento" },
    hasEntries ? { label: "Conferir", state: "current", detail: "Em andamento" } : { label: "Conferir", state: "locked", detail: "Após o 1º registro" },
    synced ? { label: "Sincronizar", state: "done", detail: "Concluída" } : { label: "Sincronizar", state: "pending", detail: "Falta enviar" },
    { label: "Analisar", state: "available", detail: "Disponível" },
    synced ? { label: "Finalizar", state: "available", detail: "Disponível" } : { label: "Finalizar", state: "locked", detail: "Após sincronizar" },
  ];
}

function Marker({ step, index }: { step: InventoryStep; index: number }) {
  if (step.state === "done") {
    return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>;
  }
  if (step.state === "locked") {
    return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
  }
  return <span aria-hidden="true">{index + 1}</span>;
}

export function InventorySteps({ steps }: { steps: InventoryStep[] }) {
  const current = steps.find((step) => step.state === "current");
  return (
    <ol className={styles.steps} aria-label={`Etapas do inventário. Etapa atual: ${current?.label ?? "Finalizar"}`}>
      {steps.map((step, index) => (
        <li key={step.label} className={`${styles.step} ${styles[step.state]}`} aria-current={step.state === "current" ? "step" : undefined}>
          <span className={styles.track}>
            <span className={styles.marker}><Marker step={step} index={index} /></span>
            {index < steps.length - 1 ? <span className={styles.line} aria-hidden="true" /> : null}
          </span>
          <span className={styles.label}>{step.label}</span>
          <span className={styles.detail}>{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}
