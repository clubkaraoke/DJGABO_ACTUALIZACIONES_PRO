import { eq, and } from "drizzle-orm";
import type { AuthorizationService } from "@djgabo/domain";
import type { BatchStrategy } from "@djgabo/shared";
import type { Db } from "../db/client.js";
import { collections, karaokes, assets, downloadLogs, deviceSessions } from "../db/schema.js";
import { createId } from "../db/id.js";
import { resolveArchiveKey, type StorageService, type ArchiveStatus } from "./StorageService.js";

export interface BatchFileItem {
  karaokeId: string;
  title: string;
  artist: string;
  url: string;
  size: number;
  fileName: string;
  mimeType: string;
}

export type BatchDownloadResult =
  | {
      ok: true;
      strategy: "MULTI_FILE";
      totalFiles: number;
      totalSize: number;
      files: BatchFileItem[];
    }
  | {
      ok: true;
      strategy: "PREBUILT_ARCHIVE";
      totalFiles: number;
      /** Tamaño REAL del .zip (StorageProvider.getMetadata), nunca la suma de los masters. */
      totalSize: number;
      url: string;
      fileName: string;
      mimeType: string;
    }
  | { ok: false; reason: string };

/**
 * POST /api/downloads/collection/:id — "Descargar todo".
 *
 * Dos estrategias:
 *  - PREBUILT_ARCHIVE: un único .zip ya armado en storage. Se verifica su
 *    existencia real vía StorageService.getArchiveStatus ANTES de intentar
 *    generar la URL — nunca se asume que existe.
 *  - MULTI_FILE: N URLs temporales, una por karaoke.
 */
export class BatchDownloadService {
  constructor(
    private readonly db: Db,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
  ) {}

  async downloadCollection(
    userId: string,
    collectionId: string,
    strategy: BatchStrategy,
    context: { deviceId: string | null; ip: string | null },
  ): Promise<BatchDownloadResult> {
    const check = await this.authorization.canDownloadCollection(userId, collectionId, context.deviceId);
    if (!check.allowed) return { ok: false, reason: check.reason ?? "FORBIDDEN" };

    const collection = await this.db.query.collections.findFirst({ where: eq(collections.id, collectionId) });
    if (!collection) return { ok: false, reason: "COLLECTION_NOT_FOUND" };

    const collectionKaraokes = await this.db.query.karaokes.findMany({ where: eq(karaokes.collectionId, collectionId) });
    const available: { id: string; title: string; artist: string; masterAssetId: string }[] = [];
    for (const k of collectionKaraokes) {
      if (k.masterAssetId) available.push({ id: k.id, title: k.title, artist: k.artist, masterAssetId: k.masterAssetId });
    }
    const masterAssets = await Promise.all(
      available.map((k) => this.db.query.assets.findFirst({ where: eq(assets.id, k.masterAssetId) })),
    );
    const totalSize = masterAssets.reduce((sum, a) => sum + (a?.size ?? 0), 0);

    // Nunca se intenta generar una URL de descarga para un ZIP que no existe:
    // se verifica la disponibilidad ANTES de tocar dispositivos o logs, así
    // una estrategia no disponible no dejar rastro de una "descarga" que
    // nunca ocurrió. Se guarda el resultado para reusar su `size` real más
    // abajo (punto 2: el totalSize del ZIP nunca es la suma de los masters).
    let archiveStatus: ArchiveStatus | null = null;
    if (strategy === "PREBUILT_ARCHIVE") {
      archiveStatus = await this.storage.getArchiveStatus(collection.slug);
      if (!archiveStatus.available) {
        return { ok: false, reason: "ARCHIVE_NOT_AVAILABLE" };
      }
    }

    if (context.deviceId) {
      const existing = await this.db.query.deviceSessions.findFirst({
        where: and(eq(deviceSessions.userId, userId), eq(deviceSessions.deviceId, context.deviceId)),
      });
      if (existing) {
        await this.db.update(deviceSessions).set({ lastSeenAt: new Date(), active: true }).where(eq(deviceSessions.id, existing.id));
      } else {
        await this.db.insert(deviceSessions).values({
          id: createId("dev"),
          userId,
          deviceId: context.deviceId,
          active: true,
          lastSeenAt: new Date(),
        });
      }
    }

    await this.db.insert(downloadLogs).values({
      id: createId("dl"),
      userId,
      collectionId,
      type: strategy === "PREBUILT_ARCHIVE" ? "COLLECTION_ARCHIVE" : "COLLECTION_MULTI",
      ip: context.ip ?? undefined,
      deviceId: context.deviceId ?? undefined,
      createdAt: new Date(),
    });

    if (strategy === "PREBUILT_ARCHIVE") {
      const archiveKey = resolveArchiveKey(collection.slug);
      const { url } = await this.storage.getDownloadUrl(archiveKey);
      const fileName = archiveKey.split("/").pop()!;
      return {
        ok: true,
        strategy,
        totalFiles: available.length,
        // Tamaño REAL del .zip vía StorageProvider.getMetadata (archiveStatus
        // ya lo trae de la verificación de disponibilidad de arriba) — nunca
        // la suma de los masters, que puede ser muy distinta al tamaño
        // comprimido real del archive.
        totalSize: archiveStatus?.size ?? 0,
        url,
        fileName,
        mimeType: "application/zip",
      };
    }

    const files: BatchFileItem[] = [];
    for (let i = 0; i < available.length; i++) {
      const k = available[i]!;
      const asset = masterAssets[i];
      if (!asset) continue;
      const { url } = await this.storage.getDownloadUrl(asset.storageKey);
      files.push({ karaokeId: k.id, title: k.title, artist: k.artist, url, size: asset.size, fileName: asset.fileName, mimeType: asset.mimeType });
    }
    return { ok: true, strategy, totalFiles: files.length, totalSize, files };
  }
}
