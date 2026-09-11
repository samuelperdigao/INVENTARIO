"use client";

export interface AuthTeam {
  id: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  teams: AuthTeam[];
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? "http://localhost:8000";
let accessToken: string | undefined;
let currentUser: AuthUser | undefined;

async function authRequest(path: string, init: RequestInit = {}): Promise<AuthResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { detail?: string } | undefined;
    throw new Error(body?.detail ?? "Não foi possível concluir a autenticação.");
  }
  const result = await response.json() as AuthResponse;
  accessToken = result.accessToken;
  currentUser = result.user;
  return result;
}

export async function registerAccount(input: { email: string; password: string; displayName: string; teamName: string }): Promise<AuthUser> {
  return (await authRequest("/api/v1/auth/register", { method: "POST", body: JSON.stringify(input) })).user;
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthUser> {
  return (await authRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify(input) })).user;
}

export async function restoreSession(): Promise<AuthUser | undefined> {
  try {
    return (await authRequest("/api/v1/auth/refresh", { method: "POST", body: "{}" })).user;
  } catch {
    accessToken = undefined;
    currentUser = undefined;
    return undefined;
  }
}

export async function getAuthenticatedContext(): Promise<{ accessToken: string; teamId: string }> {
  if (!accessToken || !currentUser) await restoreSession();
  if (!accessToken || !currentUser) throw new Error("Entre na sua conta antes de sincronizar. Seus dados locais continuam preservados.");
  const selectedTeamId = typeof window === "undefined" ? undefined : window.sessionStorage.getItem("inventory-active-team");
  const team = currentUser.teams.find((candidate) => candidate.id === selectedTeamId) ?? currentUser.teams[0];
  if (!team) throw new Error("Sua conta não possui uma equipe para sincronizar.");
  return { accessToken, teamId: team.id };
}

export function getCurrentUser(): AuthUser | undefined {
  return currentUser;
}

export function selectActiveTeam(teamId: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem("inventory-active-team", teamId);
}

export async function logoutAccount(): Promise<void> {
  await fetch(`${apiBaseUrl}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
  accessToken = undefined;
  currentUser = undefined;
}
