import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: TEST_PASSWORD } });
  return res.json().accessToken;
}

describe("Desvincular dispositivo desde el panel admin", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let memberToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    memberToken = await loginAs(app, "active@test.local");
    adminToken = await loginAs(app, "admin@test.local");
  });
  afterAll(async () => {
    await app.close();
  });

  it("un dispositivo recién registrado puede descargar con normalidad", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { deviceName: "Dispositivo a desvincular" },
    });
    expect(reg.statusCode).toBe(201);
    const { deviceToken } = reg.json();

    const download = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${memberToken}`, "x-device-token": deviceToken },
    });
    expect(download.statusCode).toBe(200);

    // ---- Admin ve el dispositivo en el detalle del cliente ----
    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/clients/${fixtures.activeUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const deviceRow = detail.json().devices.find((d: { active: boolean }) => d.active);
    expect(deviceRow).toBeTruthy();

    // ---- Admin lo desvincula ----
    const deactivate = await app.inject({
      method: "POST",
      url: `/api/admin/clients/${fixtures.activeUserId}/devices/${deviceRow.id}/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deactivate.statusCode).toBe(204);

    // ---- El MISMO token, que antes funcionaba, ahora se rechaza de inmediato ----
    const afterDeactivation = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${memberToken}`, "x-device-token": deviceToken },
    });
    expect(afterDeactivation.statusCode).toBe(401);
    expect(afterDeactivation.json().error).toBe("DEVICE_TOKEN_INVALID");
  });

  it("un MEMBER no puede desvincular dispositivos (guard de ADMIN sigue vigente)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/clients/${fixtures.activeUserId}/devices/cualquier-id/deactivate`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("desvincular un id de dispositivo inexistente devuelve 404, no 204 silencioso", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/clients/${fixtures.activeUserId}/devices/no-existe/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
