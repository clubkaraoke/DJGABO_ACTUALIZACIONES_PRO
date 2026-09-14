import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD } from "./testApp.js";

async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: TEST_PASSWORD } });
  return res.json().accessToken;
}

describe("Guard de rol ADMIN en /api/admin/*", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
    memberToken = await loginAs(app, "active@test.local");
    adminToken = await loginAs(app, "admin@test.local");
  });
  afterAll(async () => {
    await app.close();
  });

  const adminEndpoints: Array<{ method: "GET" | "POST"; url: string }> = [
    { method: "GET", url: "/api/admin/clients" },
    { method: "GET", url: "/api/admin/plans" },
    { method: "GET", url: "/api/admin/collections" },
    { method: "GET", url: "/api/admin/karaokes" },
    { method: "GET", url: "/api/admin/downloads" },
    { method: "GET", url: "/api/admin/dashboard" },
    { method: "GET", url: "/api/admin/sync/status" },
  ];

  for (const endpoint of adminEndpoints) {
    it(`un MEMBER recibe 403 en ${endpoint.method} ${endpoint.url} aunque escriba la URL manualmente`, async () => {
      const res = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("FORBIDDEN");
    });

    it(`un ADMIN sí puede acceder a ${endpoint.method} ${endpoint.url}`, async () => {
      const res = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  }

  it("sin token, cualquier ruta /api/admin/* devuelve 401 (no 403)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/clients" });
    expect(res.statusCode).toBe(401);
  });
});
