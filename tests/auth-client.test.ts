import { afterEach, expect, it, vi } from "vitest";

const user = {
  id: "user-1",
  email: "operador@gerdau.com.br",
  displayName: "Operador",
  recoveryPinConfigured: true,
  teams: [],
};

function token(expiration: number): string {
  const payload = window.btoa(JSON.stringify({ exp: expiration }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${payload}.signature`;
}

function authResponse(accessToken: string): Response {
  return new Response(JSON.stringify({ accessToken, user }), { status: 200 });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("reutiliza a sessão recém-criada sem chamar refresh novamente", async () => {
  const fetchMock = vi.fn().mockResolvedValue(authResponse(token(Date.now() / 1000 + 900)));
  vi.stubGlobal("fetch", fetchMock);
  const auth = await import("@/lib/auth-client");

  expect(auth.hasCachedUser()).toBe(false);
  await expect(auth.loginAccount({ email: user.email, password: "senha-segura-123" })).resolves.toEqual(user);
  expect(auth.hasCachedUser()).toBe(true);
  await expect(auth.restoreSession()).resolves.toEqual(user);

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("renova a sessão quando o token em memória expirou", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(authResponse(token(Date.now() / 1000 - 1)))
    .mockResolvedValueOnce(authResponse(token(Date.now() / 1000 + 900)));
  vi.stubGlobal("fetch", fetchMock);
  const auth = await import("@/lib/auth-client");

  await auth.loginAccount({ email: user.email, password: "senha-segura-123" });
  await expect(auth.restoreSession()).resolves.toEqual(user);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toContain("/api/v1/auth/refresh");
});
