import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { MockStorageProvider } from "@djgabo/storage";
import * as schema from "../src/db/schema.js";
import { createId } from "../src/db/id.js";
import { buildApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const migrationPath = path.resolve(__dirname, "../drizzle/0000_pale_fabian_cortez.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");
  // drizzle-kit separa statements con "--> statement-breakpoint"
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) sqlite.exec(trimmed);
  }
  // The baseline Drizzle SQL predates the production schema extensions.
  // Keep the in-memory integration DB aligned with the current app schema.
  sqlite.exec([
    "ALTER TABLE plans ADD COLUMN max_collection_downloads_per_day INTEGER NOT NULL DEFAULT 2",
    "ALTER TABLE plans ADD COLUMN max_distinct_collections_per_day INTEGER NOT NULL DEFAULT 5",
    "ALTER TABLE plans ADD COLUMN max_selected_collections INTEGER",
    "CREATE TABLE IF NOT EXISTS user_download_collections (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, selected_at INTEGER NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS user_download_collections_unique ON user_download_collections(user_id, collection_id)",
    "CREATE TABLE IF NOT EXISTS download_tickets (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_id TEXT NOT NULL, kind TEXT NOT NULL, resource_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER)",
    "CREATE TABLE IF NOT EXISTS external_auth_identities (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, provider_subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email_at_link TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS external_auth_provider_subject_unique ON external_auth_identities(provider, provider_subject)",
    "CREATE TABLE IF NOT EXISTS auth_bridge_assertions (jti TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, consumed_at INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sync_state (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, root_path TEXT NOT NULL, cursor TEXT NOT NULL, initialized_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS sync_state_provider_root_unique ON sync_state(provider,root_path)"
  ].join(";") + ";");
  return drizzle(sqlite, { schema });
}

export const TEST_PASSWORD = "Test1234!";

export interface TestFixtures {
  adminId: string;
  activeUserId: string;
  suspendedUserId: string;
  expiredUserId: string;
  collectionAllowedId: string;
  collectionBlockedId: string;
  collectionInactiveId: string;
  karaokeId: string;
  karaokeNoMasterId: string;
  karaokeMp3Id: string;
  karaokeWavId: string;
  collectionArchiveId: string;
  karaokeArchiveAId: string;
  karaokeArchiveBId: string;
}

export async function buildTestApp(): Promise<{ app: FastifyInstance; fixtures: TestFixtures }> {
  const db = loadTestDb();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // rounds bajos: los tests no necesitan seguridad, solo velocidad

  const now = new Date();
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
  const past = new Date(Date.now() - 1000 * 60 * 60 * 24);

  const adminId = createId("usr");
  await db.insert(schema.users).values({
    id: adminId, email: "admin@test.local", passwordHash, name: "Admin Test",
    role: "ADMIN", status: "ACTIVE", maxDevices: 10, createdAt: now, updatedAt: now,
  });

  const activeUserId = createId("usr");
  await db.insert(schema.users).values({
    id: activeUserId, email: "active@test.local", passwordHash, name: "Miembro Activo",
    role: "MEMBER", status: "ACTIVE", subscriptionEnd: future, maxDevices: 2, createdAt: now, updatedAt: now,
  });

  const suspendedUserId = createId("usr");
  await db.insert(schema.users).values({
    id: suspendedUserId, email: "suspendido@test.local", passwordHash, name: "Miembro Suspendido",
    role: "MEMBER", status: "SUSPENDED", subscriptionEnd: future, maxDevices: 2, createdAt: now, updatedAt: now,
  });

  const expiredUserId = createId("usr");
  await db.insert(schema.users).values({
    id: expiredUserId, email: "vencido@test.local", passwordHash, name: "Miembro Vencido",
    role: "MEMBER", status: "ACTIVE", subscriptionEnd: past, maxDevices: 2, createdAt: now, updatedAt: now,
  });

  const collectionAllowedId = createId("col");
  await db.insert(schema.collections).values({
    id: collectionAllowedId, slug: "test-allowed", title: "Colección Permitida", year: 2026, month: 1,
    storagePath: "/ACTUALIZACIONES/2026/01 ENERO", updatedAt: now, createdAt: now, active: true,
  });

  const collectionBlockedId = createId("col");
  await db.insert(schema.collections).values({
    id: collectionBlockedId, slug: "test-blocked", title: "Colección Bloqueada", year: 2026, month: 2,
    storagePath: "/ACTUALIZACIONES/2026/02 FEBRERO", updatedAt: now, createdAt: now, active: true,
  });

  const collectionInactiveId = createId("col");
  await db.insert(schema.collections).values({
    id: collectionInactiveId, slug: "test-inactive", title: "Colección Inactiva", year: 2026, month: 3,
    storagePath: "/ACTUALIZACIONES/2026/03 MARZO", updatedAt: now, createdAt: now, active: false,
  });

  await db.insert(schema.userCollectionAccess).values({
    id: createId("access"), userId: activeUserId, collectionId: collectionAllowedId, enabled: true, grantedAt: now,
  });

  const masterAssetId = createId("ast");
  await db.insert(schema.assets).values({
    id: masterAssetId, storageKey: "/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION.mp4",
    fileName: "ARTISTA - CANCION.mp4", size: 40_000_000, mimeType: "video/mp4", provider: "mock", type: "MASTER", createdAt: now,
  });
  const previewAssetId = createId("ast");
  await db.insert(schema.assets).values({
    id: previewAssetId, storageKey: "/ACTUALIZACIONES/_PREVIEWS/CODE1.mp4",
    fileName: "CODE1.mp4", size: 3_000_000, mimeType: "video/mp4", provider: "mock", type: "PREVIEW", createdAt: now,
  });

  const karaokeId = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeId, title: "Canción", artist: "Artista", code: "TEST-0001", identityKey: "identity-TEST-0001", collectionId: collectionAllowedId,
    masterAssetId, previewAssetId, createdAt: now,
  });

  const karaokeNoMasterId = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeNoMasterId, title: "Sin Master", artist: "Artista", code: "TEST-0002", identityKey: "identity-TEST-0002", collectionId: collectionAllowedId,
    masterAssetId: null, previewAssetId: null, createdAt: now,
  });

  // Punto 1/7: activos con extensiones distintas a .mp4, para probar que el
  // backend nunca fuerza una extensión — conserva la real de cada Asset.
  const mp3AssetId = createId("ast");
  await db.insert(schema.assets).values({
    id: mp3AssetId, storageKey: "/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION MP3.mp3",
    fileName: "ARTISTA - CANCION MP3.mp3", size: 8_000_000, mimeType: "audio/mpeg", provider: "mock", type: "MASTER", createdAt: now,
  });
  const karaokeMp3Id = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeMp3Id, title: "Canción MP3", artist: "Artista", code: "TEST-0003", identityKey: "identity-TEST-0003", collectionId: collectionAllowedId,
    masterAssetId: mp3AssetId, previewAssetId: null, createdAt: now,
  });

  const wavAssetId = createId("ast");
  await db.insert(schema.assets).values({
    id: wavAssetId, storageKey: "/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION WAV.wav",
    fileName: "ARTISTA - CANCION WAV.wav", size: 60_000_000, mimeType: "audio/wav", provider: "mock", type: "MASTER", createdAt: now,
  });
  const karaokeWavId = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeWavId, title: "Canción WAV", artist: "Artista", code: "TEST-0004", identityKey: "identity-TEST-0004", collectionId: collectionAllowedId,
    masterAssetId: wavAssetId, previewAssetId: null, createdAt: now,
  });

  // Punto 2/7: colección donde la suma de los masters (25 GB) es distinta al
  // tamaño real del .zip pre-armado (20 GB) — PREBUILT_ARCHIVE debe reportar
  // el tamaño REAL del archive, nunca la suma de los masters.
  const collectionArchiveId = createId("col");
  await db.insert(schema.collections).values({
    id: collectionArchiveId, slug: "test-archive", title: "Colección con Archive", year: 2026, month: 5,
    storagePath: "/ACTUALIZACIONES/2026/05 MAYO", updatedAt: now, createdAt: now, active: true,
  });
  await db.insert(schema.userCollectionAccess).values({
    id: createId("access"), userId: activeUserId, collectionId: collectionArchiveId, enabled: true, grantedAt: now,
  });

  const GB = 1_000_000_000;
  const archiveMasterAId = createId("ast");
  await db.insert(schema.assets).values({
    id: archiveMasterAId, storageKey: "/ACTUALIZACIONES/2026/05 MAYO/ARTISTA - PISTA A.mp4",
    fileName: "ARTISTA - PISTA A.mp4", size: 12.5 * GB, mimeType: "video/mp4", provider: "mock", type: "MASTER", createdAt: now,
  });
  const karaokeArchiveAId = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeArchiveAId, title: "Pista A", artist: "Artista", code: "TEST-ARCHIVE-A", identityKey: "identity-TEST-ARCHIVE-A", collectionId: collectionArchiveId,
    masterAssetId: archiveMasterAId, previewAssetId: null, createdAt: now,
  });

  const archiveMasterBId = createId("ast");
  await db.insert(schema.assets).values({
    id: archiveMasterBId, storageKey: "/ACTUALIZACIONES/2026/05 MAYO/ARTISTA - PISTA B.mp4",
    fileName: "ARTISTA - PISTA B.mp4", size: 12.5 * GB, mimeType: "video/mp4", provider: "mock", type: "MASTER", createdAt: now,
  });
  const karaokeArchiveBId = createId("kar");
  await db.insert(schema.karaokes).values({
    id: karaokeArchiveBId, title: "Pista B", artist: "Artista", code: "TEST-ARCHIVE-B", identityKey: "identity-TEST-ARCHIVE-B", collectionId: collectionArchiveId,
    masterAssetId: archiveMasterBId, previewAssetId: null, createdAt: now,
  });

  const mock = new MockStorageProvider();
  mock.seedFile("/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION.mp4", { size: 40_000_000 });
  mock.seedFile("/ACTUALIZACIONES/_PREVIEWS/CODE1.mp4", { size: 3_000_000 });
  // Archivo "pendiente de sincronizar": existe en storage pero no en la DB todavía.
  mock.seedFile("/ACTUALIZACIONES/2026/04 ABRIL/NUEVO ARTISTA - NUEVA CANCION.mp4", { size: 45_000_000 });
  mock.seedFile("/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION MP3.mp3", { size: 8_000_000, contentType: "audio/mpeg" });
  mock.seedFile("/ACTUALIZACIONES/2026/01 ENERO/ARTISTA - CANCION WAV.wav", { size: 60_000_000, contentType: "audio/wav" });
  // El .zip real pesa 20 GB aunque los masters sumen 25 GB (12.5 GB c/u):
  // PREBUILT_ARCHIVE debe reportar el tamaño real del archive, no la suma.
  mock.seedFile("/ACTUALIZACIONES/2026/05 MAYO/ARTISTA - PISTA A.mp4", { size: 12.5 * 1_000_000_000 });
  mock.seedFile("/ACTUALIZACIONES/2026/05 MAYO/ARTISTA - PISTA B.mp4", { size: 12.5 * 1_000_000_000 });
  mock.seedFile("/ARCHIVES/test-archive.zip", { size: 20 * 1_000_000_000, contentType: "application/zip" });

  const env: Env = {
    NODE_ENV: "test",
    PORT: 0,
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
  };

  const app = await buildApp({ db, env, storageProvider: mock, storageProviderReason: "test" });

  return {
    app,
    fixtures: {
      adminId,
      activeUserId,
      suspendedUserId,
      expiredUserId,
      collectionAllowedId,
      collectionBlockedId,
      collectionInactiveId,
      karaokeId,
      karaokeNoMasterId,
      karaokeMp3Id,
      karaokeWavId,
      collectionArchiveId,
      karaokeArchiveAId,
      karaokeArchiveBId,
    },
  };
}
