"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  confirmPasswordReset, loginAccount, registerAccount, requestPasswordReset,
  resendVerificationCode, restoreSession, verifyEmail,
} from "@/lib/auth-client";

type View = "login" | "register" | "verify" | "forgot" | "reset";

export function AuthFlow() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void restoreSession().then((user) => { if (user) router.replace("/dashboard"); });
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
        await loginAccount({ email: submittedEmail, password: String(form.get("password") ?? "") });
        router.replace("/dashboard");
      } else if (view === "register") {
        const result = await registerAccount({
          displayName: String(form.get("displayName") ?? ""),
          email: submittedEmail,
          password: String(form.get("password") ?? ""),
        });
        setEmail(submittedEmail); setMessage(result); setView("verify");
      } else if (view === "verify") {
        await verifyEmail({ email: submittedEmail, code: String(form.get("code") ?? "") });
        router.replace("/dashboard");
      } else if (view === "forgot") {
        const result = await requestPasswordReset(submittedEmail);
        setEmail(submittedEmail); setMessage(result); setView("reset");
      } else {
        const result = await confirmPasswordReset({
          email: submittedEmail,
          code: String(form.get("code") ?? ""),
          newPassword: String(form.get("newPassword") ?? ""),
          passwordConfirmation: String(form.get("passwordConfirmation") ?? ""),
        });
        setMessage(result); setView("login");
      }
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Não foi possível concluir a solicitação.";
      setError(text);
      if (view === "login" && text.includes("Confirme seu e-mail")) setView("verify");
    } finally { setBusy(false); }
  }

  async function resend(): Promise<void> {
    setBusy(true); setError(undefined);
    try { setMessage(await resendVerificationCode(email)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reenviar o código."); }
    finally { setBusy(false); }
  }

  const title = view === "login" ? "Acesse sua conta" : view === "register" ? "Crie seu acesso" : view === "verify" ? "Confirme seu e-mail" : view === "forgot" ? "Recupere sua senha" : "Defina uma nova senha";
  const description = view === "login" ? "Entre com seu e-mail corporativo para acessar os inventários." : view === "register" ? "O cadastro é individual e não cria uma equipe automaticamente." : view === "verify" ? "Digite o código de seis números enviado ao seu e-mail corporativo." : view === "forgot" ? "Enviaremos um código de recuperação para sua conta corporativa." : "Confirme o código recebido e escolha uma senha segura.";

  return (
    <main className="auth-shell">
      <section className="auth-aside" aria-label="Apresentação do sistema">
        <Link className="app-brand brand-link light-brand" href="/">
          <span className="brand-mark beam-mark" aria-hidden="true"><span /></span>
          <span><strong>INVENTARIO</strong><small>Laminação de Perfis</small></span>
        </Link>
        <div><p className="eyebrow light-eyebrow">Acesso corporativo</p><h1>Controle que acompanha a operação.</h1><p>Dados preservados no dispositivo, sincronização protegida e relatórios oficiais em um só fluxo.</p></div>
        <ul className="auth-benefits"><li>Cadastro exclusivo @gerdau.com.br</li><li>Conta confirmada por código</li><li>Sessões renováveis e revogáveis</li></ul>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <Link className="back-link" href="/">‹ Voltar para o início</Link>
          <p className="eyebrow">Conta INVENTARIO</p>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          <form className="stack auth-form" onSubmit={(event) => void submit(event)}>
            {view === "register" ? <label>Nome completo<input name="displayName" autoComplete="name" required maxLength={120} placeholder="Como você quer ser chamado" /></label> : null}
            <label>E-mail corporativo<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" pattern="[^@]+@gerdau\.com\.br" placeholder="nome.sobrenome@gerdau.com.br" /></label>
            {view === "login" || view === "register" ? <label>Senha<input name="password" type="password" required minLength={view === "register" ? 12 : 1} autoComplete={view === "register" ? "new-password" : "current-password"} placeholder={view === "register" ? "Mínimo de 12 caracteres" : "Sua senha"} /></label> : null}
            {view === "verify" || view === "reset" ? <label>Código de 6 números<input className="code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="000000" /></label> : null}
            {view === "reset" ? <><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirmar nova senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label></> : null}
            <button className="primary" type="submit" disabled={busy}>{busy ? "Aguarde…" : view === "login" ? "Entrar" : view === "register" ? "Cadastrar e enviar código" : view === "verify" ? "Confirmar e acessar" : view === "forgot" ? "Enviar código" : "Atualizar senha"}</button>
          </form>
          {message ? <p className="notice" role="status">{message}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="auth-links">
            {view === "login" ? <><button type="button" onClick={() => changeView("forgot")}>Esqueci minha senha</button><button type="button" onClick={() => changeView("register")}>Criar conta</button></> : null}
            {view === "register" || view === "forgot" || view === "reset" ? <button type="button" onClick={() => changeView("login")}>Voltar para o login</button> : null}
            {view === "verify" ? <><button type="button" disabled={busy || !email} onClick={() => void resend()}>Reenviar código</button><button type="button" onClick={() => changeView("login")}>Voltar para o login</button></> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
