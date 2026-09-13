import Link from "next/link";

import { LandingBrand } from "@/components/landing-brand";
import styles from "./landing.module.css";

const operationSteps = [
  {
    title: "Lançamento direto",
    description: "Registre lado, vão, camada, lote e quantidade diretamente no dispositivo.",
  },
  {
    title: "Continuidade offline",
    description: "Os lançamentos permanecem salvos no dispositivo mesmo quando a conexão não está disponível.",
  },
  {
    title: "Sincronização entre dispositivos",
    description: "Conecte a equipe ao mesmo inventário e consolide o trabalho quando houver rede.",
  },
  {
    title: "Finalização e exportação",
    description: "Consolide os dados e compartilhe o resultado final em PDF, Excel ou Word.",
  },
];

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Navegação principal">
        <Link className="app-brand brand-link" href="/" aria-label="INVENTARIO, início">
          <span className="brand-mark beam-mark" aria-hidden="true"><span /></span>
          <span><strong>INVENTARIO</strong><small>Beam Blanks e Blocos</small></span>
        </Link>
        <Link className="secondary compact-button" href="/acesso">Entrar</Link>
      </nav>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.brandColumn}>
          <h1 id="landing-title" className={styles.srOnly}>INVENTÁRIO</h1>
          <div className={styles.brandStage}>
            <div className={styles.brandFrame}>
              <LandingBrand />
            </div>
            <div className={styles.introPanel}>
              <h2>Inventário de Beam Blanks e Blocos</h2>
              <p>Coleta de campo, conferência e relatórios em um fluxo operacional.</p>
            </div>
          </div>
          <div className={styles.actions}>
            <Link className={`primary button-link ${styles.primaryCta}`} href="/acesso">
              Acessar sistema <span aria-hidden="true">→</span>
            </Link>
            <a className={`secondary button-link ${styles.secondaryCta}`} href="#como-funciona">Conhecer o fluxo</a>
          </div>
        </div>

        <aside className={styles.operationCard} aria-label="Recursos operacionais do sistema">
          <div className={styles.cardHeader}>
            <div>
              <p>Operação em campo</p>
              <h2>Recursos do inventário</h2>
            </div>
            <span className={styles.readyBadge}>Pronto</span>
          </div>

          <ol className={styles.operationList}>
            {operationSteps.map((step, index) => (
              <li className={styles.operationItem} key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.operationCopy}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.cardFooter} aria-label="Características da operação">
            <span>Mobile first</span>
            <span>Operação offline</span>
            <span>Dados rastreáveis</span>
          </div>
        </aside>
      </section>

      <section className="landing-section" id="como-funciona" aria-labelledby="flow-title">
        <div className="section-intro"><p className="eyebrow">Fluxo operacional</p><h2 id="flow-title">Registro, sincronização, análise e relatório.</h2></div>
        <div className="landing-flow">
          <article><span>01</span><h3>Registre</h3><p>Lance lado, vão, lote e quantidade com poucos toques, mesmo sem conexão.</p></article>
          <article><span>02</span><h3>Sincronize</h3><p>Compartilhe um código de seis números e trabalhe com a equipe sem expor chaves técnicas.</p></article>
          <article><span>03</span><h3>Analise</h3><p>Identifique lotes fragmentados, peças solteiras e distribuições que exigem revisão.</p></article>
          <article><span>04</span><h3>Finalize</h3><p>Congele o relatório oficial e compartilhe PDF, Excel ou Word pelo celular.</p></article>
        </div>
      </section>
    </main>
  );
}
