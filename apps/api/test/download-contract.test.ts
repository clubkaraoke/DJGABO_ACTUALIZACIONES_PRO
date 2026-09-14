import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: TEST_PASSWORD } });
  return res.json().accessToken;
}

async function registerDevice(app: FastifyInstance, token: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/devices/register",
    headers: { authorization: `Bearer ${token}` },
    payload: { deviceName: "Test" },
  });
  return res.json().deviceToken;
}

describe("Contrato de descarga: nombre/tipo real y tamaño real del ZIP", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let token: string;
  let deviceToken: string;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    token = await loginAs(app, "active@test.local");
    deviceToken = await registerDevice(app, token);
  });
  afterAll(async () => {
    await app.close();
  });

  describe("extensión real preservada (punto 1 y 7)", () => {
    it("una descarga individual MP4 conserva su extensión y mimeType reales", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.fileName).toBe("ARTISTA - CANCION.mp4");
      expect(body.mimeType).toBe("video/mp4");
    });

    it("una descarga individual MP3 conserva la extensión .mp3, nunca .mp4", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/karaoke/${fixtures.karaokeMp3Id}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.fileName).toBe("ARTISTA - CANCION MP3.mp3");
      expect(body.fileName.endsWith(".mp3")).toBe(true);
      expect(body.mimeType).toBe("audio/mpeg");
    });

    it("una descarga individual WAV conserva la extensión .wav, nunca .mp4", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/karaoke/${fixtures.karaokeWavId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.fileName).toBe("ARTISTA - CANCION WAV.wav");
      expect(body.fileName.endsWith(".wav")).toBe(true);
      expect(body.mimeType).toBe("audio/wav");
    });

    it("la descarga completa MULTI_FILE reporta el fileName/mimeType real de cada karaoke", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/collection/${fixtures.collectionAllowedId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
        payload: { strategy: "MULTI_FILE" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const mp3File = body.files.find((f: { fileName: string }) => f.fileName.endsWith(".mp3"));
      const wavFile = body.files.find((f: { fileName: string }) => f.fileName.endsWith(".wav"));
      const mp4File = body.files.find((f: { fileName: string }) => f.fileName.endsWith(".mp4"));
      expect(mp3File.mimeType).toBe("audio/mpeg");
      expect(wavFile.mimeType).toBe("audio/wav");
      expect(mp4File.mimeType).toBe("video/mp4");
    });

    it("la descarga como ZIP siempre trae fileName terminado en .zip y mimeType application/zip", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/collection/${fixtures.collectionArchiveId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
        payload: { strategy: "PREBUILT_ARCHIVE" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.fileName.endsWith(".zip")).toBe(true);
      expect(body.mimeType).toBe("application/zip");
    });
  });

  describe("tamaño real del ZIP (punto 2 y 7)", () => {
    it("un ZIP de 20 GB con masters que suman 25 GB reporta 20 GB, no la suma", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/collection/${fixtures.collectionArchiveId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
        payload: { strategy: "PREBUILT_ARCHIVE" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const TWENTY_GB = 20 * 1_000_000_000;
      const TWENTY_FIVE_GB = 25 * 1_000_000_000;
      expect(body.totalSize).toBe(TWENTY_GB);
      expect(body.totalSize).not.toBe(TWENTY_FIVE_GB);
    });

    it("en cambio, MULTI_FILE para la misma colección sí reporta la suma real de los masters (25 GB)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/downloads/collection/${fixtures.collectionArchiveId}`,
        headers: { authorization: `Bearer ${token}`, "x-device-token": deviceToken },
        payload: { strategy: "MULTI_FILE" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalSize).toBe(25 * 1_000_000_000);
    });
  });
});
