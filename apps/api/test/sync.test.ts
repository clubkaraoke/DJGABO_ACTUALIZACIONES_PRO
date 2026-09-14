import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD } from "./testApp.js";

async function loginAsAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "admin@test.local", password: TEST_PASSWORD },
  });
  return res.json().accessToken;
}

describe("Sincronización (StorageIndexerService vía API)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    ({ app } = await buildTestApp());
    adminToken = await loginAsAdmin(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it("analyze (DRY_RUN) detecta el archivo nuevo sin crear la colección", async () => {
    const before = await app.inject({
      method: "GET",
      url: "/api/admin/collections",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const countBefore = before.json().length;

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/sync/analyze",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dryRun).toBe(true);
    expect(body.newCount).toBeGreaterThanOrEqual(1);

    const after = await app.inject({
      method: "GET",
      url: "/api/admin/collections",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(after.json().length).toBe(countBefore); // el dry-run no escribió nada
  });

  it("run sincroniza de verdad y crea la colección de Abril 2026", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/sync/run",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dryRun).toBe(false);

    const after = await app.inject({
      method: "GET",
      url: "/api/admin/collections",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const abril = after.json().find((c: { title: string }) => c.title.includes("Abril"));
    expect(abril).toBeTruthy();
  });

  it("correr la sincronización de nuevo no duplica el karaoke ya indexado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/sync/run",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.json().newCount).toBe(0);
  });
});
