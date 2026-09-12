"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { addTeamMember, restoreSession, type AuthUser } from "@/lib/auth-client";

export function TeamPanel() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>();
  const [teamId, setTeamId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "OPERATOR">("OPERATOR");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((restored) => {
        if (!active) return;
        if (!restored) { router.replace("/acesso"); return; }
        setUser(restored);
        const firstAdminTeam = restored.teams.find((team) => team.role === "ADMIN");
        if (!firstAdminTeam) { router.replace("/dashboard"); return; }
        setTeamId(firstAdminTeam.id);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  const adminTeams = useMemo(() => user?.teams.filter((team) => team.role === "ADMIN") ?? [], [user]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true); setMessage(undefined); setError(undefined);
    try {
      const updated = await addTeamMember(teamId, { email: email.trim().toLowerCase(), role });
      setUser(updated);
      setEmail("");
      setMessage("Usuário associado à equipe com sucesso.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível associar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <main className="shell"><p className="muted">Carregando gestão de equipe…</p></main>;

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-topbar">
        <Link className="app-brand brand-link" href="/dashboard"><span className="brand-mark beam-mark" aria-hidden="true"><span /></span><span><strong>INVENTARIO</strong><small>Laminação de Perfis</small></span></Link>
        <Link className="text-button" href="/dashboard">Voltar ao painel</Link>
      </header>

      <section className="dashboard-hero">
        <div><p className="eyebrow">Administração</p><h1>Gestão da equipe</h1><p>Associe usuários já cadastrados e verificados à equipe operacional.</p></div>
      </section>

      <section className="card section-card stack">
        <div className="section-header"><div><p className="eyebrow">Permissões</p><h2>Adicionar membro</h2><p className="muted">O usuário precisa ter criado e verificado a conta com e-mail @gerdau.com.br.</p></div></div>
        {message ? <p className="notice" role="status">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label>Equipe
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
              {adminTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label>E-mail corporativo
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@gerdau.com.br" required autoComplete="email" />
          </label>
          <label>Perfil
            <select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "OPERATOR")}>
              <option value="OPERATOR">Operador</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <button className="primary" type="submit" disabled={saving || !teamId}>{saving ? "Associando…" : "Associar usuário"}</button>
        </form>
        <p className="security-note">Administradores podem associar usuários à equipe. Operadores não recebem acesso a esta tela nem ao endpoint administrativo.</p>
      </section>
    </main>
  );
}
