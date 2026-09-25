import { afterEach, expect, it, vi } from "vitest";

const authenticatedUser = {
  id: "user-id",
  email: "operador@example.com",
  displayName: "Operador",
  recoveryPinConfigured: true,
  teams: [],
};

function authenticatedResponse(accessToken = "access-token"): Response {
  return new Response(JSON.stringify({ accessToken, user: authenticatedUser }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenWithExpiry(expiration: number): string {
  const payload = btoa(JSON.stringify({ exp: expiration })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.localStorage.clear();
});

it("reutiliza a sessão recém-criada ao entrar no painel", async () => {
  const fetchMock = vi.fn().mockResolvedValue(authenticatedResponse());
  vi.stubGlobal("fetch", fetchMock);
  const { loginAccount, restoreSession } = await import("@/lib/auth-client");

  await loginAccount({ email: authenticatedUser.email, password: "senha-segura" });

  await expect(restoreSession()).resolves.toEqual(authenticatedUser);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("compartilha uma única renovação entre chamadas simultâneas", async () => {
  const fetchMock = vi.fn().mockResolvedValue(authenticatedResponse());
  vi.stubGlobal("fetch", fetchMock);
  const { restoreSession } = await import("@/lib/auth-client");

  await expect(Promise.all([restoreSession(), restoreSession()])).resolves.toEqual([authenticatedUser, authenticatedUser]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("não descarta um login concluído por uma renovação anterior que falhou", async () => {
  let rejectRefresh: (reason?: unknown) => void = () => undefined;
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectRefresh = reject; }))
    .mockResolvedValueOnce(authenticatedResponse());
  vi.stubGlobal("fetch", fetchMock);
  const { loginAccount, restoreSession } = await import("@/lib/auth-client");

  const refresh = restoreSession();
  await loginAccount({ email: authenticatedUser.email, password: "senha-segura" });
  rejectRefresh(new TypeError("Falha de rede"));

  await expect(refresh).resolves.toEqual(authenticatedUser);
  await expect(restoreSession()).resolves.toEqual(authenticatedUser);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("renova o access token expirado antes de entregar a sessão à próxima chamada", async () => {
  const expiredToken = tokenWithExpiry(Math.floor(Date.now() / 1000) - 1);
  const freshToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 900);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(authenticatedResponse(expiredToken))
    .mockResolvedValueOnce(authenticatedResponse(freshToken));
  vi.stubGlobal("fetch", fetchMock);
  const { getAuthenticatedSession, loginAccount } = await import("@/lib/auth-client");

  await loginAccount({ email: authenticatedUser.email, password: "senha-segura" });
  await expect(getAuthenticatedSession()).resolves.toMatchObject({ accessToken: freshToken, user: authenticatedUser });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/v1/auth/refresh");
});
