import { MockStorageProvider } from "./MockStorageProvider.js";
import { DropboxStorageProvider, loadDropboxConfigFromEnv } from "./DropboxStorageProvider.js";
import type { StorageProvider } from "./StorageProvider.js";

export interface CreateStorageProviderResult {
  provider: StorageProvider;
  reason: string;
}

/**
 * Único punto de decisión de qué StorageProvider usar. Nada más en el
 * sistema debe hacer `new DropboxStorageProvider(...)` directamente.
 *
 * Si STORAGE_PROVIDER=dropbox pero faltan credenciales, cae automáticamente
 * a Mock en vez de romper el arranque (punto 8).
 */
export function createStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
  sharedMock?: MockStorageProvider,
): CreateStorageProviderResult {
  const requested = (env.STORAGE_PROVIDER ?? "mock").toLowerCase();

  if (requested === "dropbox") {
    const config = loadDropboxConfigFromEnv(env);
    if (config) {
      return {
        provider: new DropboxStorageProvider(config),
        reason: "STORAGE_PROVIDER=dropbox con credenciales completas",
      };
    }
    return {
      provider: sharedMock ?? new MockStorageProvider(),
      reason: "STORAGE_PROVIDER=dropbox pero faltan credenciales — usando MockStorageProvider",
    };
  }

  return {
    provider: sharedMock ?? new MockStorageProvider(),
    reason: "STORAGE_PROVIDER=mock (o no configurado)",
  };
}
