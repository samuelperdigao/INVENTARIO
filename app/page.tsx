import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";
import { LandingProductPreview } from "@/components/landing-product-preview";

import styles from "./landing.module.css";

export default function HomePage() {
  return (
    <main className={`landing-shell ${styles.referenceLanding}`}>
      <nav className={`landing-nav ${styles.referenceNav}`} aria-label="Navegação principal">
        <Link className="brand-link" href="/" aria-label="INVENTÁRIO, início"><BrandLogo /></Link>
        <Link className="secondary compact-button" href="/acesso">Entrar</Link>
      </nav>

      <section className={styles.referenceHero} aria-labelledby="landing-title">
        <div className={styles.heroIndustrial}>
          <div className={styles.heroIndustrialOverlay} />
          <div className={styles.heroIndustrialContent}>
            <BrandLogo light subtitle="Beam Blanks e Blocos" />
            <p className={styles.heroKicker}>Aplicativo de inventário industrial</p>
            <h1 id="landing-title">Do pátio ao relatório,<br /><span>com mais controle.</span></h1>
            <p className={styles.heroDescription}>Registre lado, vão, camada, lote e quantidade no dispositivo, mesmo sem conexão.</p>
            <div className={styles.heroSignals}><span><Icon name="check" size={15} />Operação offline</span><span><Icon name="check" size={15} />Dados rastreáveis</span><span><Icon name="check" size={15} />Relatórios oficiais</span></div>
          </div>
          <div className={styles.heroFooter}><BrandLogo light compact markOnly /><span>Beam Blanks e Blocos</span></div>
        </div>

        <aside className={styles.loginPreview} aria-label="Prévia do acesso ao sistema">
          <div className={styles.loginPreviewHeader}><BrandLogo compact /><span className={styles.previewBell}>◌</span></div>
          <p className={styles.previewEyebrow}>Conta INVENTÁRIO</p>
          <h2>Bem-vindo(a)</h2>
          <p>Acesse sua conta para continuar.</p>
          <div className={styles.previewInput}><Icon name="users" size={15} />seu.email@gerdau.com.br</div>
          <div className={styles.previewInput}><Icon name="settings" size={15} />Senha <span>◉</span></div>
          <div className={styles.previewRemember}><span><i />Lembrar de mim</span><a href="/acesso">Esqueceu a senha?</a></div>
          <Link className={`primary button-link ${styles.previewLoginButton}`} href="/acesso">Entrar</Link>
          <div className={styles.previewOr}><span />ou<span /></div>
          <Link className={`secondary button-link ${styles.previewRegisterButton}`} href="/acesso"><Icon name="users" size={14} />Cadastrar nova conta</Link>
          <small className={styles.previewRestricted}>Acesso restrito a e-mails corporativos da Gerdau.</small>
          <div className={styles.previewGerdau}>GERDAU</div>
        </aside>
      </section>

      <LandingProductPreview />
    </main>
  );
}
