import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: TEST_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return res.json().accessToken as string;
}

describe("STAGING smoke flow", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("valida login → acceso → colección → descarga → auditoría admin", async () => {
    const memberToken = await login(app, "active@test.local");

    const collectionsRes = await app.inject({
      method: "GET",
      url: "/api/collections",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(collectionsRes.statusCode).toBe(200);
    const collections = collectionsRes.json() as Array<{ id: string; locked: boolean }>;
    expect(collections.find((c) => c.id === fixtures.collectionAllowedId)?.locked).toBe(false);
    expect(collections.find((c) => c.id === fixtures.collectionBlockedId)?.locked).toBe(true);

    const allowedRes = await app.inject({
      method: "GET",
      url: `/api/collections/${fixtures.collectionAllowedId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(allowedRes.statusCode).toBe(200);
    expect(allowedRes.json().karaokes.some((k: { id: string }) => k.id === fixtures.karaokeId)).toBe(true);

    const blockedRes = await app.inject({
      method: "GET",
      url: `/api/collections/${fixtures.collectionBlockedId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(blockedRes.statusCode).toBe(403);

    const deviceRes = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { deviceName: "Smoke CI" },
    });
    expect(deviceRes.statusCode).toBe(201);
    const deviceToken = deviceRes.json().deviceToken as string;

    const downloadRes = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-device-token": deviceToken,
      },
    });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.json()).toMatchObject({
      fileName: "ARTISTA - CANCION.mp4",
      mimeType: "video/mp4",
    });

    const adminToken = await login(app, "admin@test.local");
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/admin/downloads",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const audit = auditRes.json() as {
      total: number;
      items: Array<{
        userName: string;
        karaokeTitle: string | null;
        karaokeArtist: string | null;
        karaokeCode: string | null;
        collectionTitle: string | null;
      }>;
    };
    expect(audit.total).toBeGreaterThanOrEqual(1);
    expect(audit.items[0]).toMatchObject({
      userName: "Miembro Activo",
      karaokeTitle: "Canción",
      karaokeArtist: "Artista",
      karaokeCode: "TEST-0001",
      collectionTitle: "Colección Permitida",
    });
  });
});
