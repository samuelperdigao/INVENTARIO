import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icon";

import styles from "@/app/landing.module.css";

const previewInventories = [
  ["#270754", "12/09/2026", "Pátio Principal", "Finalizado"],
  ["#270753", "11/09/2026", "Pátio Leste", "Em andamento"],
  ["#270752", "10/09/2026", "Pátio Oeste", "Finalizado"],
];

const actionCards = [
  { icon: "plus" as const, title: "Iniciar novo inventário", detail: "Registrar um novo levantamento", active: true },
  { icon: "boxes" as const, title: "Meus inventários", detail: "Acessar inventários em andamento" },
  { icon: "chart" as const, title: "Relatórios", detail: "Exporte e compartilhe" },
  { icon: "cloud" as const, title: "Sincronizar", detail: "Envie ou baixe dados" },
];

export function LandingProductPreview() {
  return (
    <section className={styles.productSection} aria-labelledby="product-preview-title">
      <div className={styles.sectionIntroRow}>
        <div>
          <p className={styles.kicker}>Visão do produto</p>
          <h2 id="product-preview-title">Um fluxo completo, do lançamento ao relatório.</h2>
        </div>
        <span className={styles.liveBadge}><span /> Interface operacional</span>
      </div>

      <div className={styles.productBoard}>
        <div className={styles.desktopPreview}>
          <aside className={styles.previewSidebar}>
            <BrandLogo compact subtitle="Beam Blanks e Blocos" />
            <nav aria-label="Prévia da navegação">
              <span className={styles.previewNavActive}><Icon name="home" size={15} />Início</span>
              <span><Icon name="plus" size={15} />Novo inventário</span>
              <span><Icon name="history" size={15} />Histórico</span>
              <span><Icon name="file" size={15} />Relatórios</span>
              <span><Icon name="sync" size={15} />Sincronizar</span>
              <span><Icon name="settings" size={15} />Configurações</span>
            </nav>
            <small className={styles.previewSidebarFoot}>Laminação de Perfis</small>
          </aside>

          <div className={styles.previewMain}>
            <header className={styles.previewTopbar}>
              <div><strong>Bem-vindo(a), Samuel! 👋</strong><span>Aplicativo de Inventário de Beam Blanks e Blocos</span></div>
              <div className={styles.previewAccount}><span>SP</span><small>samuel.cunha@gerdau.com.br</small></div>
            </header>
            <div className={styles.previewBannerRow}>
              <div className={styles.previewImageBanner}><span>Organização de campo,<br /><b>registro confiável.</b></span><small>Inventário simples, rápido e rastreável.</small></div>
              <div className={styles.previewDate}><strong>Sexta-feira</strong><b>12 de setembro de 2026</b><small>Inventário em operação.</small></div>
            </div>
            <div className={styles.previewActionGrid}>
              {actionCards.map((card) => <div className={`${styles.previewAction} ${card.active ? styles.previewActionActive : ""}`} key={card.title}><Icon name={card.icon} size={23} /><strong>{card.title}</strong><small>{card.detail}</small></div>)}
            </div>
            <div className={styles.previewRecent}>
              <div className={styles.previewRecentHeader}><strong>Inventários recentes</strong><span>Ver todos <Icon name="arrow" size={13} /></span></div>
              {previewInventories.map(([id, date, place, status]) => <div className={styles.previewRecentRow} key={id}><Icon name="file" size={16} /><b>{id}</b><span>{date}</span><span>{place}</span><em className={status === "Finalizado" ? styles.previewStatusDone : ""}>{status}</em><span>›</span></div>)}
            </div>
          </div>
        </div>

        <div className={styles.mobilePreview}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneNotch} />
            <div className={styles.phoneStatus}><span>9:41</span><span>● ◔ ▰</span></div>
            <div className={styles.phoneTopbar}><Icon name="menu" size={16} /><BrandLogo compact markOnly /><span className={styles.phoneAvatar}>SP</span></div>
            <p className={styles.phoneGreeting}>Olá, Samuel! 👋</p>
            <small className={styles.phoneSubtitle}>Beam Blanks e Blocos</small>
            <div className={styles.phoneBanner}><strong>Mais controle<br />para a operação.</strong><span>•••</span></div>
            <div className={styles.phonePrimary}><Icon name="plus" size={18} />Iniciar novo inventário</div>
            <div className={styles.phoneActions}>{[...actionCards.slice(1), { icon: "settings" as const, title: "Configurações", detail: "" }].map((card) => <div key={card.title}><Icon name={card.icon} size={18} /><span>{card.title}</span></div>)}</div>
            <p className={styles.phoneQuote}>Operação local, sincronização protegida.</p>
          </div>
        </div>
      </div>

      <div className={styles.workflowPreview}>
        <div className={styles.entryPreview}>
          <div className={styles.previewPanelHeader}><span className={styles.panelNumber}>01</span><div><b>Lançamento de itens</b><small>Registre os dados encontrados no pátio.</small></div><span className={styles.savedBadge}><Icon name="check" size={12} />Salvo localmente</span></div>
          <div className={styles.entryPreviewBody}>
            <div className={styles.previewStepRail}><span className={styles.currentStep}>01&nbsp; Lançar</span><span>02&nbsp; Conferência</span><span>03&nbsp; Sincronização</span><span>04&nbsp; Análise</span><span>05&nbsp; Finalização</span></div>
            <div className={styles.previewEntryForm}><div className={styles.previewFieldRow}><div><small>Lado</small><b>LP</b></div><div><small>Vão</small><b>15</b></div><div><small>Camada</small><b>1</b></div></div><div className={styles.previewFieldRow}><div><small>Lote</small><b>123456</b></div><div><small>Quantidade</small><b>24 peças</b></div></div><div className={styles.previewAdd}><Icon name="plus" size={15} />Adicionar lançamento</div></div>
            <div className={styles.previewTable}><div className={styles.previewTableTabs}><b>Lado LP (24)</b><span>Lado LE (24)</span></div><strong>Vão 15 <small>8 itens</small></strong><div className={styles.previewTableHead}><span>Lote</span><span>Camada</span><span>Quantidade</span><span>Ações</span></div>{[["2712345678", "1", "24"], ["2712345679", "1", "18"], ["2712345680", "2", "12"]].map((row) => <div className={styles.previewTableRow} key={row[0]}><span>{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span><span>✎　▣</span></div>)}</div>
          </div>
        </div>

        <div className={styles.finishPreview}>
          <div className={styles.dimLayer} />
          <div className={styles.finishDialog}><span className={styles.finishIcon}><Icon name="file" size={23} /></span><b>Finalizar inventário?</b><p>Os lançamentos permanecerão preservados e não poderão ser alterados sem uma regra de reabertura aprovada.</p><div><span>Cancelar</span><strong><Icon name="check" size={14} />Finalizar inventário</strong></div></div>
        </div>

        <div className={styles.successPreview}>
          <span className={styles.successIcon}><Icon name="check" size={28} /></span><b>Inventário finalizado<br />com sucesso!</b><p>O relatório está disponível para consulta e exportação.</p><span className={styles.successAction}><Icon name="file" size={14} />Exportar relatório</span><span className={styles.successActionMuted}>Enviar por e-mail</span><span className={styles.successActionMuted}>Compartilhar</span>
        </div>
      </div>
    </section>
  );
}
