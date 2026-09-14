import { eq, and } from "drizzle-orm";
import type { IndexerRepositoryPort } from "@djgabo/storage";
import type { Db } from "./client.js";
import { collections, assets, karaokes, syncRuns } from "./schema.js";
import { createId } from "./id.js";

export class DrizzleIndexerRepository implements IndexerRepositoryPort {
  constructor(
    private readonly db: Db,
    private readonly storageProviderKind: "mock" | "dropbox",
  ) {}

  async findCollectionByYearMonth(year: number, month: number) {
    const c = await this.db.query.collections.findFirst({
      where: and(eq(collections.year, year), eq(collections.month, month)),
    });
    return c ? { id: c.id } : null;
  }

  async createCollection(input: { year: number; month: number; title: string; storagePath: string }) {
    const id = createId("col");
    const now = new Date();
    await this.db.insert(collections).values({
      id,
      year: input.year,
      month: input.month,
      title: input.title,
      slug: `${input.year}-${String(input.month).padStart(2, "0")}`,
      storagePath: input.storagePath,
      publishedAt: now,
      updatedAt: now,
      createdAt: now,
    });
    return { id };
  }

  async findAssetByStorageKey(provider: string, storageKey: string) {
    const a = await this.db.query.assets.findFirst({
      where: and(eq(assets.provider, provider), eq(assets.storageKey, storageKey)),
    });
    return a ? { id: a.id, size: a.size, storageKey: a.storageKey } : null;
  }

  async findAssetByProviderFileId(provider: string, providerFileId: string) {
    const a = await this.db.query.assets.findFirst({
      where: and(eq(assets.provider, provider), eq(assets.providerFileId, providerFileId)),
    });
    return a ? { id: a.id, size: a.size, storageKey: a.storageKey } : null;
  }

  async upsertAsset(input: {
    storageKey: string;
    fileName: string;
    size: number;
    mimeType: string;
    type: "MASTER" | "PREVIEW" | "COVER" | "ARCHIVE";
    providerFileId?: string | null;
  }) {
    // Identidad estable primero (punto 1): si el provider da un providerFileId,
    // ese es el que decide si este archivo ya existe — el storageKey puede
    // haber cambiado por un rename/move y no por eso es "otro" archivo.
    // AISLAMIENTO ENTRE PROVIDERS (esta pasada): ambas búsquedas van scoped a
    // `this.storageProviderKind` — el mismo providerFileId o el mismo
    // storageKey en OTRO provider son archivos distintos, nunca se
    // confunden ni se pisan entre sí.
    const existing = input.providerFileId
      ? await this.db.query.assets.findFirst({
          where: and(eq(assets.provider, this.storageProviderKind), eq(assets.providerFileId, input.providerFileId)),
        })
      : await this.db.query.assets.findFirst({
          where: and(eq(assets.provider, this.storageProviderKind), eq(assets.storageKey, input.storageKey)),
        });

    if (existing) {
      await this.db
        .update(assets)
        .set({
          size: input.size,
          mimeType: input.mimeType,
          fileName: input.fileName,
          storageKey: input.storageKey, // actualiza el path si cambió (rename/move)
          ...(input.providerFileId ? { providerFileId: input.providerFileId } : {}),
        })
        .where(eq(assets.id, existing.id));
      return { id: existing.id, isNew: false };
    }
    const id = createId("ast");
    await this.db.insert(assets).values({
      id,
      storageKey: input.storageKey,
      fileName: input.fileName,
      size: input.size,
      mimeType: input.mimeType,
      provider: this.storageProviderKind,
      type: input.type,
      providerFileId: input.providerFileId ?? null,
      createdAt: new Date(),
    });
    return { id, isNew: true };
  }

  async findKaraokeByIdentityKey(identityKey: string) {
    const k = await this.db.query.karaokes.findFirst({ where: eq(karaokes.identityKey, identityKey) });
    return k ? { id: k.id, collectionId: k.collectionId } : null;
  }

  async upsertKaraoke(input: {
    collectionId: string;
    identityKey: string;
    code: string;
    title: string;
    artist: string;
    masterAssetId: string;
    previewAssetId?: string;
  }) {
    const existing = await this.db.query.karaokes.findFirst({ where: eq(karaokes.identityKey, input.identityKey) });
    if (existing) {
      await this.db
        .update(karaokes)
        .set({
          title: input.title,
          artist: input.artist,
          code: input.code,
          masterAssetId: input.masterAssetId,
          // Si el archivo se movió a otro mes (identidad estable por
          // providerFileId), el karaoke pasa a pertenecer a la colección
          // actual en vez de quedar huérfano en la vieja.
          collectionId: input.collectionId,
          // Solo se actualiza si vino un valor: nunca se borra un preview ya
          // asociado simplemente porque esta corrida no lo volvió a detectar.
          ...(input.previewAssetId ? { previewAssetId: input.previewAssetId } : {}),
        })
        .where(eq(karaokes.id, existing.id));
      return { id: existing.id, isNew: false };
    }
    const id = createId("kar");
    await this.db.insert(karaokes).values({
      id,
      identityKey: input.identityKey,
      code: input.code,
      title: input.title,
      artist: input.artist,
      collectionId: input.collectionId,
      masterAssetId: input.masterAssetId,
      previewAssetId: input.previewAssetId ?? null,
      publishedAt: new Date(),
      createdAt: new Date(),
    });
    return { id, isNew: true };
  }

  async recordSyncRun(result: {
    dryRun: boolean;
    filesDetected: number;
    newCount: number;
    updatedCount: number;
    errorCount: number;
  }) {
    await this.db.insert(syncRuns).values({
      id: createId("sync"),
      provider: this.storageProviderKind,
      dryRun: result.dryRun,
      filesDetected: result.filesDetected,
      newCount: result.newCount,
      updatedCount: result.updatedCount,
      errorCount: result.errorCount,
      createdAt: new Date(),
    });
  }
}
