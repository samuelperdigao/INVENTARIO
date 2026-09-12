import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Navegação principal">
        <Link className="app-brand brand-link" href="/" aria-label="INVENTARIO, início">
          <span className="brand-mark beam-mark" aria-hidden="true"><span /></span>
          <span><strong>INVENTARIO</strong><small>Laminação de Perfis</small></span>
        </Link>
        <Link className="secondary compact-button" href="/acesso">Entrar</Link>
      </nav>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="eyebrow">Controle de inventário industrial</p>
          <h1 id="landing-title">Conferência precisa.<br /><span>Do chão de fábrica ao relatório.</span></h1>
          <p className="landing-lead">Registre lotes e perfis estruturais com agilidade, trabalhe mesmo sem internet e transforme os lançamentos em relatórios claros e rastreáveis.</p>
          <div className="landing-actions">
            <Link className="primary button-link" href="/acesso">Acessar sistema <span aria-hidden="true">→</span></Link>
            <a className="secondary button-link" href="#como-funciona">Conhecer o fluxo</a>
          </div>
          <div className="trust-row" aria-label="Benefícios principais">
            <span>Operação offline</span><span>Sincronização segura</span><span>PDF, Excel e Word</span>
          </div>
        </div>

        <div className="landing-visual" aria-label="Resumo das capacidades do sistema">
          <div className="visual-header"><span className="visual-status">Exemplo de análise</span><span className="live-dot">Processado</span></div>
          <div className="visual-metrics"><div><small>Registros</small><strong>2</strong></div><div><small>Lotes</small><strong>1</strong></div><div><small>Resultado</small><strong>19 + 1</strong></div></div>
          <div className="visual-list">
            <div><span className="location-badge">DE · 15</span><p><strong>Lote 2815634434</strong><small>19 peças no local principal</small></p><span className="ok-dot" /></div>
            <div><span className="location-badge alert-badge">EF · 21</span><p><strong>Mesmo lote identificado</strong><small>1 peça solteira detectada</small></p><span className="alert-dot" /></div>
          </div>
          <div className="visual-footer"><span>Relatório inteligente</span><strong>Pronto para conferência</strong></div>
        </div>
      </section>

      <section className="landing-section" id="como-funciona" aria-labelledby="flow-title">
        <div className="section-intro"><p className="eyebrow">Fluxo operacional</p><h2 id="flow-title">Simples para lançar. Confiável para conferir.</h2></div>
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
