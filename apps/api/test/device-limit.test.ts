import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, TEST_PASSWORD, type TestFixtures } from "./testApp.js";

async function registerDevice(app: FastifyInstance, token: string, name: string) {
  return app.inject({
    method: "POST",
    url: "/api/devices/register",
    headers: { authorization: `Bearer ${token}` },
    payload: { deviceName: name },
  });
}

describe("Seguridad de dispositivos (maxDevices=2, deviceId server-issued)", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let token: string;
  let deviceTokenA: string;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "active@test.local", password: TEST_PASSWORD },
    });
    token = login.json().accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  it("descargar sin X-Device-Token se rechaza con 401 DEVICE_TOKEN_REQUIRED (el body ya no puede traer un deviceId)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}` },
      // Intento de bypass: mandar un deviceId directamente en el body, como
      // hacía la versión vieja del cliente. La ruta ya no lee este campo.
      payload: { deviceId: "device-cualquiera" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("DEVICE_TOKEN_REQUIRED");
  });

  it("un token de dispositivo inventado/corrupto se rechaza con 401 DEVICE_TOKEN_INVALID", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}`, "x-device-token": "esto-no-es-un-jwt-valido" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("DEVICE_TOKEN_INVALID");
  });

  it("registra el primer dispositivo y permite descargar con su token", async () => {
    const reg = await registerDevice(app, token, "Laptop A");
    expect(reg.statusCode).toBe(201);
    deviceTokenA = reg.json().deviceToken;
    expect(deviceTokenA).toBeTruthy();

    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}`, "x-device-token": deviceTokenA },
    });
    expect(res.statusCode).toBe(200);
  });

  it("registra un segundo dispositivo (dentro del límite de 2) y también puede descargar", async () => {
    const reg = await registerDevice(app, token, "Laptop B");
    expect(reg.statusCode).toBe(201);
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}`, "x-device-token": reg.json().deviceToken },
    });
    expect(res.statusCode).toBe(200);
  });

  it("un tercer registro de dispositivo se rechaza con 409 DEVICE_LIMIT_REACHED — el límite se aplica en el registro, no se puede evadir omitiendo el body", async () => {
    const reg = await registerDevice(app, token, "Laptop C");
    expect(reg.statusCode).toBe(409);
    expect(reg.json().error).toBe("DEVICE_LIMIT_REACHED");
  });

  it("el primer dispositivo (ya conocido) sigue descargando aunque el cupo esté lleno", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}`, "x-device-token": deviceTokenA },
    });
    expect(res.statusCode).toBe(200);
  });

  it("un token emitido para OTRO usuario no sirve para descargar en esta sesión (no se puede reutilizar entre cuentas)", async () => {
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: TEST_PASSWORD },
    });
    const adminToken = adminLogin.json().accessToken;
    const adminDeviceReg = await registerDevice(app, adminToken, "PC del admin");
    expect(adminDeviceReg.statusCode).toBe(201);
    const adminDeviceToken = adminDeviceReg.json().deviceToken;

    const res = await app.inject({
      method: "POST",
      url: `/api/downloads/karaoke/${fixtures.karaokeId}`,
      headers: { authorization: `Bearer ${token}`, "x-device-token": adminDeviceToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("DEVICE_TOKEN_INVALID");
  });

  it("un usuario suspendido no puede siquiera iniciar sesión para llegar a registrar un dispositivo", async () => {
    const suspendedLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "suspendido@test.local", password: TEST_PASSWORD },
    });
    expect(suspendedLogin.statusCode).toBe(403);
  });
});
