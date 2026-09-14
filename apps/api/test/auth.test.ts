import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

describe("Auth", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it("login válido devuelve accessToken, refreshToken y datos del usuario", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe("active@test.local");
    expect(body.user.role).toBe("MEMBER");
  });

  it("login con contraseña incorrecta devuelve 401 INVALID_CREDENTIALS", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: "incorrecta" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("INVALID_CREDENTIALS");
  });

  it("login con email inexistente devuelve 401 (sin filtrar si el email existe)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "no-existe@test.local", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login de usuario suspendido devuelve 403 USER_SUSPENDED", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "suspendido@test.local", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("USER_SUSPENDED");
  });

  it("login de usuario vencido devuelve 403 USER_EXPIRED", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "vencido@test.local", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("USER_EXPIRED");
  });

  it("GET /api/auth/me sin token devuelve 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/auth/me con token válido devuelve el perfil", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: TEST_PASSWORD },
    });
    const { accessToken } = login.json();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(fixtures.activeUserId);
  });

  it("refresh rota el token y el token viejo deja de servir (logout)", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: TEST_PASSWORD },
    });
    const { refreshToken } = login.json();

    const refreshed = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().accessToken).toBeTruthy();

    // el refresh token original ya fue rotado: reutilizarlo debe fallar
    const reused = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken } });
    expect(reused.statusCode).toBe(401);
  });

  it("logout revoca el refresh token", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: TEST_PASSWORD },
    });
    const { refreshToken } = login.json();

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", payload: { refreshToken } });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken } });
    expect(afterLogout.statusCode).toBe(401);
  });
});
