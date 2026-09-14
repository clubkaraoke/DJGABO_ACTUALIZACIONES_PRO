import { eq, and } from "drizzle-orm";
import type { AuthorizationService } from "@djgabo/domain";
import type { Db } from "../db/client.js";
import { karaokes, assets, downloadLogs, deviceSessions } from "../db/schema.js";
import { createId } from "../db/id.js";
import type { StorageService } from "./StorageService.js";

export type DownloadResult =
  | { ok: true; url: string; expiresAt: Date | null; fileName: string; mimeType: string }
  | { ok: false; reason: string };

/**
 * POST /api/downloads/karaoke/:id
 * autentica -> autoriza (membresía + colección + dispositivo) -> registra
 * DownloadLog -> pide URL temporal al StorageProvider -> responde. Nunca
 * devuelve storageKey, path físico ni refresh token de Dropbox.
 */
export class DownloadService {
  constructor(
    private readonly db: Db,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
  ) {}

  async downloadKaraoke(
    userId: string,
    karaokeId: string,
    context: { deviceId: string | null; ip: string | null },
  ): Promise<DownloadResult> {
    const check = await this.authorization.canDownloadKaraoke(userId, karaokeId, context.deviceId);
    if (!check.allowed) return { ok: false, reason: check.reason ?? "FORBIDDEN" };

    const karaoke = await this.db.query.karaokes.findFirst({ where: eq(karaokes.id, karaokeId) });
    if (!karaoke?.masterAssetId) return { ok: false, reason: "ASSET_NOT_AVAILABLE" };
    const masterAsset = await this.db.query.assets.findFirst({ where: eq(assets.id, karaoke.masterAssetId) });
    if (!masterAsset) return { ok: false, reason: "ASSET_NOT_AVAILABLE" };

    if (context.deviceId) await this.registerDevice(userId, context.deviceId);

    const { url, expiresAt } = await this.storage.getDownloadUrl(masterAsset.storageKey);

    await this.db.insert(downloadLogs).values({
      id: createId("dl"),
      userId,
      karaokeId,
      collectionId: karaoke.collectionId,
      assetId: masterAsset.id,
      type: "KARAOKE",
      ip: context.ip ?? undefined,
      deviceId: context.deviceId ?? undefined,
      createdAt: new Date(),
    });

    return { ok: true, url, expiresAt, fileName: masterAsset.fileName, mimeType: masterAsset.mimeType };
  }

  private async registerDevice(userId: string, deviceId: string): Promise<void> {
    const existing = await this.db.query.deviceSessions.findFirst({
      where: and(eq(deviceSessions.userId, userId), eq(deviceSessions.deviceId, deviceId)),
    });
    if (existing) {
      await this.db
        .update(deviceSessions)
        .set({ lastSeenAt: new Date(), active: true })
        .where(eq(deviceSessions.id, existing.id));
    } else {
      await this.db.insert(deviceSessions).values({
        id: createId("dev"),
        userId,
        deviceId,
        active: true,
        lastSeenAt: new Date(),
      });
    }
  }
}
