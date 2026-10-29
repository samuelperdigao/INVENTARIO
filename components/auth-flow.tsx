"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  configureRecoveryPin, confirmPasswordReset, loginAccount, registerAccount, restoreSession,
} from "@/lib/auth-client";
import { BrandLogo } from "@/components/brand-logo";
import styles from "@/components/auth.module.css";

type View = "login" | "register" | "reset" | "setup-pin";

export function AuthFlow() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    router.prefetch("/dashboard");
    void restoreSession().then((user) => {
      if (!user) return;
      if (user.recoveryPinConfigured === false) setView("setup-pin");
      else router.replace("/dashboard");
    });
  }, [router]);

  function changeView(next: View): void {
    setView(next);
    setMessage(undefined);
    setError(undefined);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setMessage(undefined); setError(undefined);
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") ?? email).trim().toLowerCase();
    try {
      if (view === "login") {
        const user = await loginAccount({ email: submittedEmail, password: String(form.get("password") ?? "") });
        if (user.recoveryPinConfigured === false) setView("setup-pin");
        else router.replace("/dashboard");
      } else if (view === "register") {
        await registerAccount({
          displayName: String(form.get("displayName") ?? ""),
          email: submittedEmail,
          password: String(form.get("password") ?? ""),
          passwordConfirmation: String(form.get("passwordConfirmation") ?? ""),
          recoveryPin: String(form.get("recoveryPin") ?? ""),
          recoveryPinConfirmation: String(form.get("recoveryPinConfirmation") ?? ""),
        });
        router.replace("/dashboard");
      } else if (view === "reset") {
        const result = await confirmPasswordReset({
          email: submittedEmail,
          recoveryPin: String(form.get("recoveryPin") ?? ""),
          newPassword: String(form.get("newPassword") ?? ""),
          passwordConfirmation: String(form.get("passwordConfirmation") ?? ""),
        });
        setMessage(result); setView("login");
      } else {
        await configureRecoveryPin({
          recoveryPin: String(form.get("recoveryPin") ?? ""),
          recoveryPinConfirmation: String(form.get("recoveryPinConfirmation") ?? ""),
        });
        router.replace("/dashboard");
      }
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Não foi possível concluir a solicitação.";
      setError(text);
    } finally { setBusy(false); }
  }

  const title = view === "login" ? "Acesse sua conta" : view === "register" ? "Crie seu acesso" : view === "reset" ? "Defina uma nova senha" : "Proteja sua recuperação";
  const description = view === "login" ? "Entre com o e-mail usado no seu cadastro para acessar os inventários." : view === "register" ? "Cadastre seu e-mail, uma senha e o NP pessoal de 8 dígitos usado somente para recuperação." : view === "reset" ? "Informe seu e-mail, o NP pessoal e escolha uma nova senha." : "Sua conta já existia antes deste recurso. Informe e confirme seu NP pessoal para continuar.";
  const loginLoading = view === "login" && busy;

  return (
    <main className={styles.shell}>
      <section className={styles.aside} aria-label="Apresentação do sistema">
        <Link className={styles.brand} href="/" aria-label="INVENTÁRIO, início"><BrandLogo light subtitle="Beam Blanks e Blocos" /></Link>
        <div className={styles.pitch}>
          <p className={styles.kicker}>Laminação de Perfis</p>
          <h1 className={styles.headline}>Inventário de Beam Blanks e Blocos</h1>
          <p className={styles.lead}>Conferência física no pátio, do primeiro lançamento ao relatório oficial.</p>
          <ul className={styles.features}>
            <li className={styles.feature}><span className={styles.featureIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18h11a4 4 0 0 0 .7-7.94A6 6 0 0 0 7.2 8.7 4.7 4.7 0 0 0 7 18Z" /><path d="M3 3l18 18" /></svg></span><span><strong>Funciona sem internet</strong>Os registros ficam salvos no aparelho.</span></li>
            <li className={styles.feature}><span className={styles.featureIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M16 4.5a3 3 0 0 1 0 5.8M19 20v-1.3a3.5 3.5 0 0 0-2.5-3.3" /></svg></span><span><strong>Equipe no mesmo inventário</strong>Entre com o código de 6 números.</span></li>
            <li className={styles.feature}><span className={styles.featureIcon} aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></svg></span><span><strong>Relatórios oficiais</strong>Excel, PDF e Word ao finalizar.</span></li>
          </ul>
        </div>
      </section>

      <section className={styles.main}>
        <div className={styles.card}>
          <Link className={styles.backLink} href="/">‹ Voltar para o início</Link>
          <p className={styles.cardKicker}>Conta INVENTARIO</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
          <form className={styles.form} aria-busy={busy} onSubmit={(event) => void submit(event)}>
            {view === "register" ? <label>Nome completo<input name="displayName" autoComplete="name" required maxLength={120} placeholder="Como você quer ser chamado" /></label> : null}
            {view !== "setup-pin" ? <label>E-mail<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="seuemail@exemplo.com" /></label> : null}
            {view === "login" || view === "register" ? <label>Senha<input name="password" type="password" required minLength={view === "register" ? 12 : 1} autoComplete={view === "register" ? "new-password" : "current-password"} placeholder={view === "register" ? "Mínimo de 12 caracteres" : "Sua senha"} /></label> : null}
            {view === "register" ? <label>Confirmar senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required placeholder="Repita sua senha" /></label> : null}
            {view === "register" || view === "reset" || view === "setup-pin" ? <label>NP pessoal de recuperação<input className={styles.code} name="recoveryPin" inputMode="numeric" autoComplete="off" pattern="\d{8}" minLength={8} maxLength={8} required placeholder="00000000" /><small>Use os 8 números do seu NP. Ele não será exibido novamente.</small></label> : null}
            {view === "register" || view === "setup-pin" ? <label>Confirmar NP pessoal<input className={styles.code} name="recoveryPinConfirmation" inputMode="numeric" autoComplete="off" pattern="\d{8}" minLength={8} maxLength={8} required placeholder="00000000" /></label> : null}
            {view === "reset" ? <><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirmar nova senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label></> : null}
            <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Aguarde…" : view === "login" ? "Entrar" : view === "register" ? "Criar conta e acessar" : view === "reset" ? "Atualizar senha" : "Salvar NP e continuar"}</button>
          </form>
          {message ? <p className={styles.notice} role="status">{message}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.links}>
            {view === "login" ? <><button type="button" onClick={() => changeView("reset")}>Esqueci minha senha</button><button type="button" onClick={() => changeView("register")}>Criar conta</button></> : null}
            {view === "register" || view === "reset" ? <button type="button" onClick={() => changeView("login")}>Voltar para o login</button> : null}
          </div>
        </div>
      </section>
      {loginLoading ? (
        <div className="auth-loading-overlay" role="status" aria-live="polite" aria-atomic="true">
          <div className="auth-loading-card">
            <div className="auth-loading-visual" aria-hidden="true">
              <span className="auth-loading-halo" />
              <span className="auth-loading-ring auth-loading-ring--outer" />
              <span className="auth-loading-ring auth-loading-ring--inner" />
              <span className="auth-loading-beacon auth-loading-beacon--one" />
              <span className="auth-loading-beacon auth-loading-beacon--two" />
              <BrandLogo compact markOnly className="auth-loading-logo" />
            </div>
            <p className="auth-loading-kicker">Acesso seguro</p>
            <h2 className="auth-loading-title">Liberando seu acesso</h2>
            <p className="auth-loading-message">Aguarde um instante enquanto validamos seus dados e preparamos sua entrada no sistema.</p>
            <div className="auth-loading-progress" aria-hidden="true"><span /></div>
            <p className="auth-loading-note">A primeira conexão após um período sem uso pode demorar um pouco mais.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
