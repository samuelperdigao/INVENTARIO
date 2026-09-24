"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  configureRecoveryPin, confirmPasswordReset, loginAccount, registerAccount, restoreSession,
} from "@/lib/auth-client";
import { BrandLogo } from "@/components/brand-logo";

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
    <main className="auth-shell">
      <section className="auth-aside" aria-label="Apresentação do sistema">
        <Link className="brand-link light-brand" href="/" aria-label="INVENTÁRIO, início"><BrandLogo light subtitle="Beam Blanks e Blocos" /></Link>
        <div><p className="eyebrow light-eyebrow">Acesso ao sistema</p><h1>Inventário de Beam Blanks e Blocos.</h1><p>Registro local, sincronização protegida e relatórios oficiais para a operação.</p></div>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <Link className="back-link" href="/">‹ Voltar para o início</Link>
          <p className="eyebrow">Conta INVENTARIO</p>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          <form className="stack auth-form" aria-busy={busy} onSubmit={(event) => void submit(event)}>
            {view === "register" ? <label>Nome completo<input name="displayName" autoComplete="name" required maxLength={120} placeholder="Como você quer ser chamado" /></label> : null}
            {view !== "setup-pin" ? <label>E-mail<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="seuemail@exemplo.com" /></label> : null}
            {view === "login" || view === "register" ? <label>Senha<input name="password" type="password" required minLength={view === "register" ? 12 : 1} autoComplete={view === "register" ? "new-password" : "current-password"} placeholder={view === "register" ? "Mínimo de 12 caracteres" : "Sua senha"} /></label> : null}
            {view === "register" ? <label>Confirmar senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required placeholder="Repita sua senha" /></label> : null}
            {view === "register" || view === "reset" || view === "setup-pin" ? <label>NP pessoal de recuperação<input className="code-input" name="recoveryPin" inputMode="numeric" autoComplete="off" pattern="\d{8}" minLength={8} maxLength={8} required placeholder="00000000" /><small>Use os 8 números do seu NP. Ele não será exibido novamente.</small></label> : null}
            {view === "register" || view === "setup-pin" ? <label>Confirmar NP pessoal<input className="code-input" name="recoveryPinConfirmation" inputMode="numeric" autoComplete="off" pattern="\d{8}" minLength={8} maxLength={8} required placeholder="00000000" /></label> : null}
            {view === "reset" ? <><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirmar nova senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label></> : null}
            <button className="primary" type="submit" disabled={busy}>{busy ? "Aguarde…" : view === "login" ? "Entrar" : view === "register" ? "Criar conta e acessar" : view === "reset" ? "Atualizar senha" : "Salvar NP e continuar"}</button>
          </form>
          {message ? <p className="notice" role="status">{message}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="auth-links">
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
