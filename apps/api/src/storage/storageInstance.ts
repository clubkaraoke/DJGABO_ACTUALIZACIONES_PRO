import { createStorageProvider, MockStorageProvider, type StorageProvider } from "@djgabo/storage";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import type { Env } from "../env.js";
import { assets } from "../db/schema.js";

let cachedProvider: StorageProvider | null = null;
let cachedMock: MockStorageProvider | null = null;
let cachedReason = "";

export function getStorageProvider(env: Env): { provider: StorageProvider; reason: string } {
  if (cachedProvider) return { provider: cachedProvider, reason: cachedReason };

  cachedMock = new MockStorageProvider();
  const { provider, reason } = createStorageProvider(
    {
      STORAGE_PROVIDER: env.STORAGE_PROVIDER,
      DROPBOX_APP_KEY: env.DROPBOX_APP_KEY,
      DROPBOX_APP_SECRET: env.DROPBOX_APP_SECRET,
      DROPBOX_REFRESH_TOKEN: env.DROPBOX_REFRESH_TOKEN,
      DROPBOX_ROOT_PATH: env.DROPBOX_ROOT_PATH,
      DROPBOX_DOWNLOAD_NAMESPACE_ID: env.DROPBOX_DOWNLOAD_NAMESPACE_ID,
    } as NodeJS.ProcessEnv,
    cachedMock,
  );

  // FAIL-FAST EN PRODUCCIÓN (punto 2): si se pidió Dropbox y no hay
  // credenciales, createStorageProvider ya cayó a Mock por diseño (no
  // rompe el arranque en dev). Pero en producción, NUNCA se debe servir
  // Mock en silencio cuando el operador explícitamente configuró Dropbox
  // — eso significaría repartir contenido simulado a clientes reales sin
  // que nadie se entere. Ahí el servidor debe fallar al arrancar.
  const requestedDropboxButFellBackToMock = env.STORAGE_PROVIDER === "dropbox" && provider.kind === "mock";
  if (requestedDropboxButFellBackToMock) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "STORAGE_PROVIDER=dropbox pero faltan credenciales de Dropbox " +
          "(DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN) y NODE_ENV=production. " +
          "El servidor no arranca: nunca se sirve MockStorageProvider en producción cuando se pidió Dropbox. " +
          "Configura las credenciales o cambia STORAGE_PROVIDER=mock explícitamente si de verdad quieres demo en producción.",
      );
    }
    console.warn(
      `⚠️  STORAGE_PROVIDER=dropbox pero faltan credenciales — usando MockStorageProvider como fallback ` +
        `(permitido solo porque NODE_ENV=${env.NODE_ENV}, nunca ocurriría en production). ${reason}`,
    );
  }

  cachedProvider = provider;
  cachedReason = reason;
  return { provider, reason };
}

/**
 * El MockStorageProvider vive en memoria y se reinicia con el proceso.
 * Para que las descargas/preview sigan funcionando tras un reinicio del API
 * (la base SQLite sí persiste en disco), hidratamos el mock con los Assets
 * que ya existen en la base de datos cada vez que arranca el servidor.
 * Esto no aplica a DropboxStorageProvider: ahí los archivos ya existen
 * físicamente en Dropbox.
 */
export async function bootstrapMockStorageFromDb(db: Db, provider: StorageProvider): Promise<void> {
  if (provider.kind !== "mock") return;
  const mock = provider as MockStorageProvider;
  // Corrección de esta pasada: solo se hidratan los Assets que pertenecen a
  // "mock" (assets.provider = 'mock'). Ahora que storageKey ya no es único
  // de forma global, un Asset de Dropbox podría compartir el mismo path que
  // uno de Mock — sembrar ambos en el filesystem virtual de Mock pisaría
  // uno con el otro y mezclaría datos de providers distintos.
  const mockAssets = await db.query.assets.findMany({ where: eq(assets.provider, "mock") });
  for (const asset of mockAssets) {
    mock.seedFile(asset.storageKey, { size: asset.size, contentType: asset.mimeType });
  }
}

/**
 * Simula archivos ya subidos a Dropbox pero TODAVÍA no sincronizados a la
 * base de datos (Octubre 2026). Así la pantalla de Sincronización (punto 24)
 * tiene contenido real que "Analizar"/"Sincronizar" pueden detectar, en vez
 * de un botón que siempre dice "0 archivos nuevos".
 */
export function seedPendingDropboxFiles(provider: StorageProvider): void {
  if (provider.kind !== "mock") return;
  const mock = provider as MockStorageProvider;
  const pendientes = [
    "GRUPO 5 - EL CARRO NUEVO.mp4",
    "ARMONIA 10 - LA REBELDE.mp4",
    "AGUA MARINA - PALOMA AJENA.mp4",
    "CORAZON SERRANO - TE VAS.mp4",
    "HERMANOS YAIPEN - PALOMITA.mp4",
    "LOS MIRLOS - SONIDO AMAZONICO.mp4",
  ];
  for (const fileName of pendientes) {
    mock.seedFile(`/ACTUALIZACIONES/2026/10 OCTUBRE/${fileName}`, {
      size: 40_000_000 + Math.floor(Math.random() * 30_000_000),
      contentType: "video/mp4",
    });
  }
  // Uno de los pendientes ya trae su preview siguiendo la convención real
  // (subcarpeta _PREVIEWS, mismo nombre de archivo), para que al sincronizar
  // Octubre 2026 desde el panel se vea el flujo de preview funcionando de
  // punta a punta con datos recién indexados (no solo sembrados a mano).
  mock.seedFile("/ACTUALIZACIONES/2026/10 OCTUBRE/_PREVIEWS/GRUPO 5 - EL CARRO NUEVO.mp4", {
    size: 3_200_000,
    contentType: "video/mp4",
  });
}

/** Semilla un .zip pre-armado por colección para la estrategia PREBUILT_ARCHIVE (punto 18). */
export async function seedSyntheticArchives(db: Db, provider: StorageProvider): Promise<void> {
  if (provider.kind !== "mock") return;
  const mock = provider as MockStorageProvider;
  const allCollections = await db.query.collections.findMany();
  for (const collection of allCollections) {
    const collectionKaraokes = await db.query.karaokes.findMany({
      where: (k, { eq }) => eq(k.collectionId, collection.id),
    });
    let totalSize = 0;
    for (const k of collectionKaraokes) {
      if (!k.masterAssetId) continue;
      const asset = await db.query.assets.findFirst({ where: (a, { eq }) => eq(a.id, k.masterAssetId!) });
      totalSize += asset?.size ?? 0;
    }
    if (totalSize === 0) continue;
    mock.seedFile(`/ARCHIVES/${collection.slug}.zip`, {
      size: Math.floor(totalSize * 0.92),
      contentType: "application/zip",
    });
  }
}

export function resetStorageProviderCacheForTests(): void {
  cachedProvider = null;
  cachedMock = null;
}
