// Schema de base de datos — DJGABO ACTUALIZACIONES PRO
//
// NOTA DE ARQUITECTURA: usamos el dialecto SQLite de Drizzle para desarrollo
// local (permitido por el punto 3). Los "enums" de negocio (Role, UserStatus,
// AssetType, DownloadType, BatchStrategy) viven como constantes TypeScript en
// @djgabo/shared y se guardan como texto plano — nunca como tipos nativos de
// un motor específico. Migrar a Postgres implica: cambiar los imports de
// "drizzle-orm/sqlite-core" a "drizzle-orm/pg-core" en este archivo, apuntar
// el driver a `postgres`/`node-postgres`, y correr las migraciones — sin
// tocar una sola línea de packages/domain, packages/storage ni las rutas.
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  maxDevices: integer("max_devices").notNull().default(2),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    role: text("role").notNull().default("MEMBER"),
    status: text("status").notNull().default("ACTIVE"),
    planId: text("plan_id").references(() => plans.id),
    subscriptionStart: integer("subscription_start", { mode: "timestamp" }),
    subscriptionEnd: integer("subscription_end", { mode: "timestamp" }),
    maxDevices: integer("max_devices").notNull().default(2),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ statusIdx: index("users_status_idx").on(t.status) }),
);

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    description: text("description"),
    coverUrl: text("cover_url"),
    storagePath: text("storage_path").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({ yearMonthIdx: uniqueIndex("collections_year_month_idx").on(t.year, t.month) }),
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    // Punto 2 (aislamiento entre providers): storageKey YA NO es único de
    // forma global. Antes lo era, y eso podía provocar un conflicto real al
    // pasar de MockStorageProvider a Dropbox si ambos tuvieran un archivo en
    // el mismo path — son archivos completamente distintos, de providers
    // distintos, y no deben competir por el mismo storageKey.
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    type: text("type").notNull(),
    metadata: text("metadata"),
    // Identidad estable que el PROVIDER asigna al archivo (punto 1). Dropbox
    // la da y persiste entre renames/moves; el storageKey en cambio puede
    // cambiar. Nullable porque no todos los providers la tienen (Mock, por
    // ejemplo, no la tiene salvo que un test la simule explícitamente).
    providerFileId: text("provider_file_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    // UNIQUE(provider, providerFileId) — punto 2. SQLite (como el estándar
    // SQL) nunca considera dos NULL iguales para efectos de UNIQUE, así que
    // esto permite tantas filas con providerFileId=NULL como haga falta
    // (providers sin id estable) sin chocar entre sí, pero impide que el
    // MISMO id de un MISMO provider quede asociado a dos Assets distintos.
    providerProviderFileIdUnique: uniqueIndex("assets_provider_provider_file_id_unique").on(t.provider, t.providerFileId),
    // UNIQUE(provider, storageKey) — punto 2 de esta pasada. Antes storageKey
    // era único de forma global; ahora dos providers distintos pueden tener
    // un Asset en el mismo path sin chocar entre sí (son archivos distintos),
    // pero un MISMO provider nunca puede tener dos filas con el mismo path.
    providerStorageKeyUnique: uniqueIndex("assets_provider_storage_key_unique").on(t.provider, t.storageKey),
  }),
);

export const karaokes = sqliteTable(
  "karaokes",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    // Código CORTO para mostrar en la UI ("DJG-XXXXXX") — punto 1: ya NO es
    // el mecanismo de identidad (antes sí lo era, vía un hash de 32 bits, lo
    // cual era una superficie de colisión real para catálogos grandes). Por
    // eso ya no es unique a nivel de base de datos: dos karaokes podrían en
    // teoría compartir el mismo código corto sin que eso sea un problema de
    // integridad — la identidad real vive en `identityKey`.
    code: text("code").notNull(),
    // Identidad interna robusta (punto 1): el providerFileId tal cual si el
    // provider lo da, o SHA-256/128 bits del storageKey como fallback — ver
    // packages/storage/src/indexer/identity.ts. ESTE es el campo que decide
    // si un archivo ya es conocido, nunca `code`.
    identityKey: text("identity_key").notNull(),
    genre: text("genre"),
    year: integer("year"),
    format: text("format"),
    size: integer("size"),
    coverUrl: text("cover_url"),
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    masterAssetId: text("master_asset_id").unique().references(() => assets.id),
    previewAssetId: text("preview_asset_id").unique().references(() => assets.id),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    collectionIdx: index("karaokes_collection_idx").on(t.collectionId),
    identityKeyUnique: uniqueIndex("karaokes_identity_key_unique").on(t.identityKey),
  }),
);

export const userCollectionAccess = sqliteTable(
  "user_collection_access",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    grantedAt: integer("granted_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
  },
  (t) => ({ userCollectionIdx: uniqueIndex("access_user_collection_idx").on(t.userId, t.collectionId) }),
);

export const downloadLogs = sqliteTable(
  "download_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    karaokeId: text("karaoke_id").references(() => karaokes.id),
    collectionId: text("collection_id").references(() => collections.id),
    assetId: text("asset_id").references(() => assets.id),
    type: text("type").notNull(),
    ip: text("ip"),
    deviceId: text("device_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    userIdx: index("download_logs_user_idx").on(t.userId),
    createdAtIdx: index("download_logs_created_at_idx").on(t.createdAt),
  }),
);

export const deviceSessions = sqliteTable(
  "device_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    name: text("name"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ userDeviceIdx: uniqueIndex("device_user_device_idx").on(t.userId, t.deviceId) }),
);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  dryRun: integer("dry_run", { mode: "boolean" }).notNull(),
  filesDetected: integer("files_detected").notNull(),
  newCount: integer("new_count").notNull(),
  updatedCount: integer("updated_count").notNull(),
  errorCount: integer("error_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------- Relaciones (habilitan la API relacional db.query.x.findMany({ with })) ----------
export const usersRelations = relations(users, ({ one, many }) => ({
  plan: one(plans, { fields: [users.planId], references: [plans.id] }),
  accesses: many(userCollectionAccess),
  downloadLogs: many(downloadLogs),
  deviceSessions: many(deviceSessions),
  refreshTokens: many(refreshTokens),
}));

export const plansRelations = relations(plans, ({ many }) => ({ users: many(users) }));

export const collectionsRelations = relations(collections, ({ many }) => ({
  karaokes: many(karaokes),
  accesses: many(userCollectionAccess),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  karaokeAsMaster: one(karaokes, { fields: [assets.id], references: [karaokes.masterAssetId] }),
  karaokeAsPreview: one(karaokes, { fields: [assets.id], references: [karaokes.previewAssetId] }),
}));

export const karaokesRelations = relations(karaokes, ({ one }) => ({
  collection: one(collections, { fields: [karaokes.collectionId], references: [collections.id] }),
  masterAsset: one(assets, { fields: [karaokes.masterAssetId], references: [assets.id] }),
  previewAsset: one(assets, { fields: [karaokes.previewAssetId], references: [assets.id] }),
}));

export const userCollectionAccessRelations = relations(userCollectionAccess, ({ one }) => ({
  user: one(users, { fields: [userCollectionAccess.userId], references: [users.id] }),
  collection: one(collections, { fields: [userCollectionAccess.collectionId], references: [collections.id] }),
}));
