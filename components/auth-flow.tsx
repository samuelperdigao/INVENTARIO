"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  confirmPasswordReset, loginAccount, registerAccount, restoreSession,
} from "@/lib/auth-client";

type View = "login" | "register" | "forgot";

function userFacingMessage(text: string): string {
  return text
    .replaceAll("e-mail corporativo", "e-mail")
    .replaceAll("conta corporativa", "conta")
    .replaceAll(" @gerdau.com.br", "");
}

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
        const password = String(form.get("password") ?? "");
        await registerAccount({
          displayName: String(form.get("displayName") ?? ""),
          email: submittedEmail,
          password,
        });
        await loginAccount({ email: submittedEmail, password });
        router.replace("/dashboard");
      } else {
        const result = await confirmPasswordReset({
          email: submittedEmail,
          newPassword: String(form.get("newPassword") ?? ""),
          passwordConfirmation: String(form.get("passwordConfirmation") ?? ""),
        });
        setEmail(submittedEmail);
        setMessage(userFacingMessage(result));
        setView("login");
      }
    } catch (cause) {
      const rawText = cause instanceof Error ? cause.message : "Não foi possível concluir a solicitação.";
      setError(userFacingMessage(rawText));
    } finally { setBusy(false); }
  }

  const title = view === "login" ? "Acesse sua conta" : view === "register" ? "Crie seu acesso" : "Defina uma nova senha";
  const description = view === "login"
    ? "Entre com o e-mail usado no seu cadastro para acessar os inventários."
    : view === "register"
      ? "Crie sua conta diretamente. Não é necessário confirmar código por e-mail."
      : "Informe o e-mail cadastrado e escolha sua nova senha.";

  return (
    <main className="auth-shell">
      <section className="auth-aside" aria-label="Apresentação do sistema">
        <Link className="app-brand brand-link light-brand" href="/">
          <span className="brand-mark beam-mark" aria-hidden="true"><span /></span>
          <span><strong>INVENTARIO</strong><small>Laminação de Perfis</small></span>
        </Link>
        <div><p className="eyebrow light-eyebrow">Acesso simples</p><h1>Controle que acompanha a operação.</h1><p>Dados preservados no dispositivo, sincronização protegida e relatórios oficiais em um só fluxo.</p></div>
        <ul className="auth-benefits"><li>Cadastro direto, sem código</li><li>Recuperação de senha simplificada</li><li>Sessões renováveis e revogáveis</li></ul>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <Link className="back-link" href="/">‹ Voltar para o início</Link>
          <p className="eyebrow">Conta INVENTARIO</p>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          <form className="stack auth-form" onSubmit={(event) => void submit(event)}>
            {view === "register" ? <label>Nome completo<input name="displayName" autoComplete="name" required maxLength={120} placeholder="Como você quer ser chamado" /></label> : null}
            <label>E-mail<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="seuemail@exemplo.com" /></label>
            {view === "login" || view === "register" ? <label>Senha<input name="password" type="password" required minLength={view === "register" ? 12 : 1} autoComplete={view === "register" ? "new-password" : "current-password"} placeholder={view === "register" ? "Mínimo de 12 caracteres" : "Sua senha"} /></label> : null}
            {view === "forgot" ? <><label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="Mínimo de 12 caracteres" /></label><label>Confirmar nova senha<input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required placeholder="Repita a nova senha" /></label></> : null}
            <button className="primary" type="submit" disabled={busy}>{busy ? "Aguarde…" : view === "login" ? "Entrar" : view === "register" ? "Criar conta" : "Atualizar senha"}</button>
          </form>
          {message ? <p className="notice" role="status">{message}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="auth-links">
            {view === "login" ? <><button type="button" onClick={() => changeView("forgot")}>Esqueci minha senha</button><button type="button" onClick={() => changeView("register")}>Criar conta</button></> : null}
            {view === "register" || view === "forgot" ? <button type="button" onClick={() => changeView("login")}>Voltar para o login</button> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
