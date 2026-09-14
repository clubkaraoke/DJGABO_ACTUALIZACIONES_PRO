import { describe, it, expect, beforeEach } from "vitest";
import { getStorageProvider, resetStorageProviderCacheForTests } from "../src/storage/storageInstance.js";
import type { Env } from "../src/env.js";

function buildEnv(overrides: Partial<Env>): Env {
  return {
    NODE_ENV: "development",
    PORT: 4000,
    DATABASE_URL: ":memory:",
    JWT_ACCESS_SECRET: "test-access-secret-0000000000000",
    JWT_REFRESH_SECRET: "test-refresh-secret-0000000000000",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL_DAYS: 30,
    DEVICE_TOKEN_SECRET: "test-device-token-secret-00000000",
    CORS_ORIGIN: "http://localhost:5173",
    STORAGE_PROVIDER: "mock",
    DROPBOX_ROOT_PATH: "/ACTUALIZACIONES",
    SYNC_ROOT_PATH: "/ACTUALIZACIONES",
    ...overrides,
  };
}

describe("Fail-fast de Dropbox en producción (punto 2)", () => {
  beforeEach(() => {
    resetStorageProviderCacheForTests();
  });

  it("STORAGE_PROVIDER=dropbox sin credenciales y NODE_ENV=production: el servidor NO arranca", () => {
    const env = buildEnv({ NODE_ENV: "production", STORAGE_PROVIDER: "dropbox" });
    expect(() => getStorageProvider(env)).toThrow(/no arranca/i);
  });

  it("STORAGE_PROVIDER=dropbox sin credenciales y NODE_ENV=development: cae a Mock sin lanzar (con warning)", () => {
    const env = buildEnv({ NODE_ENV: "development", STORAGE_PROVIDER: "dropbox" });
    let result: ReturnType<typeof getStorageProvider> | undefined;
    expect(() => {
      result = getStorageProvider(env);
    }).not.toThrow();
    expect(result?.provider.kind).toBe("mock");
  });

  it("STORAGE_PROVIDER=dropbox sin credenciales y NODE_ENV=test: también cae a Mock sin lanzar (solo production falla)", () => {
    const env = buildEnv({ NODE_ENV: "test", STORAGE_PROVIDER: "dropbox" });
    expect(() => getStorageProvider(env)).not.toThrow();
  });

  it("STORAGE_PROVIDER=dropbox CON todas las credenciales y NODE_ENV=production: no lanza, usa Dropbox de verdad", () => {
    const env = buildEnv({
      NODE_ENV: "production",
      STORAGE_PROVIDER: "dropbox",
      DROPBOX_APP_KEY: "app-key",
      DROPBOX_APP_SECRET: "app-secret",
      DROPBOX_REFRESH_TOKEN: "refresh-token",
    });
    const result = getStorageProvider(env);
    expect(result.provider.kind).toBe("dropbox");
  });

  it("STORAGE_PROVIDER=mock explícito en producción nunca falla (no se pidió Dropbox)", () => {
    const env = buildEnv({ NODE_ENV: "production", STORAGE_PROVIDER: "mock" });
    expect(() => getStorageProvider(env)).not.toThrow();
  });
});
