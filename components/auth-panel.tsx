"use client";

import { useEffect, useState } from "react";

import { getCurrentUser, loginAccount, logoutAccount, registerAccount, restoreSession, selectActiveTeam, type AuthUser } from "@/lib/auth-client";

export function AuthPanel() {
  const [user, setUser] = useState<AuthUser>();
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void restoreSession().then((restored) => setUser(restored ?? getCurrentUser()));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const authenticated = registering
        ? await registerAccount({ displayName: String(form.get("displayName") ?? ""), teamName: String(form.get("teamName") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") })
        : await loginAccount({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
      setUser(authenticated);
      selectActiveTeam(authenticated.teams[0]?.id ?? "");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  if (user) return (
    <section className="card section-card panel-card stack" aria-label="Conta e equipe">
      <div className="section-header">
        <div className="panel-heading">
          <span className="panel-index" aria-hidden="true">01</span>
          <div className="panel-copy">
            <p className="eyebrow">Acesso central</p>
            <h2>Conta conectada</h2>
            <p className="muted">{user.displayName} · {user.email}</p>
          </div>
        </div>
        <span className="micro-pill good">Sessão ativa</span>
      </div>
      <label>Equipe
        <select defaultValue={user.teams[0]?.id} onChange={(event) => selectActiveTeam(event.target.value)}>
          {user.teams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.role === "ADMIN" ? "Responsável" : "Operador"}</option>)}
        </select>
      </label>
      <button className="secondary" type="button" onClick={() => void logoutAccount().then(() => setUser(undefined))}>Sair</button>
    </section>
  );

  return (
    <section className="card section-card panel-card stack" aria-label="Acesso à sincronização">
      <div className="panel-heading">
        <span className="panel-index" aria-hidden="true">01</span>
        <div className="panel-copy">
          <p className="eyebrow">Acesso central</p>
          <h2>{registering ? "Criar conta" : "Entrar para sincronizar"}</h2>
          <p className="muted">A conta protege a sincronização entre dispositivos. O lançamento local continua funcionando offline.</p>
        </div>
      </div>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        {registering ? <><label>Seu nome<input name="displayName" required maxLength={120} /></label><label>Nome da equipe<input name="teamName" required maxLength={120} /></label></> : null}
        <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label>Senha<input name="password" type="password" required minLength={registering ? 12 : 1} autoComplete={registering ? "new-password" : "current-password"} /></label>
        <div className="actions"><button className="secondary" type="submit" disabled={loading}>{loading ? "Aguarde…" : registering ? "Criar conta" : "Entrar"}</button><button className="secondary" type="button" onClick={() => { setRegistering(!registering); setMessage(undefined); }}>{registering ? "Já tenho conta" : "Criar conta"}</button></div>
      </form>
      {message ? <p className="error" role="alert">{message}</p> : null}
    </section>
  );
}
