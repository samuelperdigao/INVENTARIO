"use client";

import { apiBaseUrl } from "@/lib/api-config";

export interface AuthTeam {
  id: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  recoveryPinConfigured: boolean;
  teams: AuthTeam[];
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

const cachedUserKey = "inventory-cached-user";
let accessToken: string | undefined;
let currentUser: AuthUser | undefined;
let refreshRequest: Promise<AuthUser | undefined> | undefined;

function cacheUser(user: AuthUser): void {
  if (typeof window !== "undefined") window.localStorage.setItem(cachedUserKey, JSON.stringify(user));
}

function cachedUser(): AuthUser | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(cachedUserKey);
    return raw ? JSON.parse(raw) as AuthUser : undefined;
  } catch { return undefined; }
}

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
  cacheUser(result.user);
  return result;
}

async function messageRequest(path: string, body: object): Promise<string> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => undefined) as { message?: string; detail?: string } | undefined;
  if (!response.ok) throw new Error(result?.detail ?? "Não foi possível concluir a solicitação.");
  return result?.message ?? "Solicitação concluída.";
}

async function authorizedUserRequest(path: string, body: object): Promise<AuthUser> {
  const session = await getAuthenticatedSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => undefined) as AuthUser | { detail?: string } | undefined;
  if (!response.ok) {
    const detail = result && "detail" in result ? result.detail : undefined;
    throw new Error(detail ?? "Não foi possível concluir a solicitação.");
  }
  const user = result as AuthUser;
  currentUser = user;
  cacheUser(user);
  return user;
}

export async function registerAccount(input: {
  email: string;
  password: string;
  passwordConfirmation: string;
  recoveryPin: string;
  recoveryPinConfirmation: string;
  displayName: string;
}): Promise<AuthUser> {
  return (await authRequest("/api/v1/auth/register", { method: "POST", body: JSON.stringify(input) })).user;
}

export async function confirmPasswordReset(input: { email: string; recoveryPin: string; newPassword: string; passwordConfirmation: string }): Promise<string> {
  return messageRequest("/api/v1/auth/password-reset/confirm", input);
}

export async function configureRecoveryPin(input: { recoveryPin: string; recoveryPinConfirmation: string }): Promise<AuthUser> {
  return authorizedUserRequest("/api/v1/auth/recovery-pin", input);
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthUser> {
  return (await authRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify(input) })).user;
}

export async function restoreSession(): Promise<AuthUser | undefined> {
  if (accessToken && currentUser) return currentUser;
  if (refreshRequest) return refreshRequest;

  refreshRequest = authRequest("/api/v1/auth/refresh", { method: "POST", body: "{}" })
    .then(({ user }) => user)
    .catch(() => {
      // A renovação iniciada ao abrir a tela pode terminar depois de um login
      // bem-sucedido. Nesse caso, não deve apagar a sessão recém-criada.
      if (!accessToken) currentUser = currentUser ?? cachedUser();
      return currentUser;
    })
    .finally(() => { refreshRequest = undefined; });

  return refreshRequest;
}

export async function getAuthenticatedContext(): Promise<{ accessToken: string; teamId: string }> {
  const session = await getAuthenticatedSession();
  const selectedTeamId = typeof window === "undefined" ? undefined : window.sessionStorage.getItem("inventory-active-team");
  const team = session.user.teams.find((candidate) => candidate.id === selectedTeamId) ?? session.user.teams[0];
  return { accessToken: session.accessToken, teamId: team?.id ?? "" };
}

export async function getAuthenticatedSession(): Promise<{ accessToken: string; user: AuthUser }> {
  if (!accessToken || !currentUser) await restoreSession();
  if (!accessToken || !currentUser) throw new Error("Entre na sua conta antes de sincronizar. Seus dados locais continuam preservados.");
  return { accessToken, user: currentUser };
}

export function getCurrentUser(): AuthUser | undefined {
  return currentUser;
}

export function selectActiveTeam(teamId: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem("inventory-active-team", teamId);
}

export async function addTeamMember(teamId: string, input: { email: string; role: "ADMIN" | "OPERATOR" }): Promise<AuthUser> {
  return authorizedUserRequest(`/api/v1/teams/${teamId}/members`, input);
}

export async function createTeam(name: string): Promise<AuthUser> {
  return authorizedUserRequest("/api/v1/teams", { name });
}

export async function logoutAccount(): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
  } finally {
    accessToken = undefined;
    currentUser = undefined;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("inventory-active-team");
      window.localStorage.removeItem(cachedUserKey);
    }
  }
}
