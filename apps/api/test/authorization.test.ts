import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: TEST_PASSWORD },
  });
  return res.json().accessToken;
}

describe("Autorización de colecciones, preview y descargas", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let memberToken: string;
  let deviceToken: string;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    memberToken = await loginAs(app, "active@test.local");
    const deviceReg = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { deviceName: "Dispositivo de test" },
    });
    deviceToken = deviceReg.json().deviceToken;
  });
  afterAll(async () => {
    await app.close();
  });

  it("acceso permitido a una colección con UserCollectionAccess habilitado", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/collections/${fixtures.collectionAllowedId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().collection.locked).toBe(false);
  });

  it("acceso bloqueado a una colección sin UserCollectionAccess", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/collections/${fixtures.collectionBlockedId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("ACCESS_NOT_GRANTED");
  });

  it("colección inactiva es rechazada aunque exista", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/collections/${fixtures.collectionInactiveId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("COLLECTION_INACTIVE");
  });

  it("el listado /api/collections marca locked=true para colecciones sin acceso", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/collections",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const list = res.json() as Array<{ id: string; locked: boolean }>;
    const allowed = list.find((c) => c.id === fixtures.collectionAllowedId);
    const blocked = list.find((c) => c.id === fixtures.collectionBlockedId);
    expect(allowed?.locked).toBe(false);
    expect(blocked?.locked).toBe(true);
  });

  it("preview autorizado devuelve una URL temporal", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/preview/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("mock://storage/preview");
  });

  it("descarga autorizada devuelve una URL temporal y nunca el storageKey crudo sin firmar", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${memberToken}`, "x-device-token": deviceToken },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain("mock://storage/download");
    expect(body.expiresAt).toBeTruthy();
    expect(body).not.toHaveProperty("storageKey");
  });

  it("descarga de un karaoke de una colección bloqueada es rechazada", async () => {
    // truco: pedimos un karaokeId que no existe en la colección permitida
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/no-existe`,
      headers: { authorization: `Bearer ${memberToken}`, "x-device-token": deviceToken },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("KARAOKE_NOT_FOUND");
  });

  it("descarga rechazada cuando el karaoke no tiene masterAsset (ASSET_NOT_AVAILABLE)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeNoMasterId}`,
      headers: { authorization: `Bearer ${memberToken}`, "x-device-token": deviceToken },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("ASSET_NOT_AVAILABLE");
  });

  it("descarga sin token es rechazada con 401", async () => {
    const res = await app.inject({ method: "POST", url: `/api/downloads/karaoke/${fixtures.karaokeId}` });
    expect(res.statusCode).toBe(401);
  });

  it("búsqueda de karaokes solo devuelve resultados de colecciones accesibles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/karaokes/search?q=Canci",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const results = res.json();
    expect(results.every((k: { collectionId: string }) => k.collectionId === fixtures.collectionAllowedId)).toBe(true);
  });

  it("búsqueda pidiendo explícitamente una colección bloqueada devuelve vacío (no fuga datos)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/karaokes/search?collectionId=${fixtures.collectionBlockedId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
