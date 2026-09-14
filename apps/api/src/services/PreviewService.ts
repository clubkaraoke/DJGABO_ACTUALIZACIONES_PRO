import { eq } from "drizzle-orm";
import type { AuthorizationService } from "@djgabo/domain";
import type { Db } from "../db/client.js";
import { karaokes, assets } from "../db/schema.js";
import type { StorageService } from "./StorageService.js";

export type PreviewResult =
  | { ok: true; url: string; expiresAt: Date | null; fileName: string; mimeType: string }
  | { ok: false; reason: string };

/**
 * CLIENTE → API → permiso (AuthorizationService) → previewAsset → URL temporal → reproductor.
 * Nunca se expone el masterAsset ni el storageKey real en la respuesta.
 */
export class PreviewService {
  constructor(
    private readonly db: Db,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageService,
  ) {}

  async getPreviewUrl(userId: string, karaokeId: string): Promise<PreviewResult> {
    const check = await this.authorization.canPreviewKaraoke(userId, karaokeId);
    if (!check.allowed) return { ok: false, reason: check.reason ?? "FORBIDDEN" };

    const karaoke = await this.db.query.karaokes.findFirst({ where: eq(karaokes.id, karaokeId) });
    if (!karaoke?.previewAssetId) return { ok: false, reason: "ASSET_NOT_AVAILABLE" };
    const previewAsset = await this.db.query.assets.findFirst({ where: eq(assets.id, karaoke.previewAssetId) });
    if (!previewAsset) return { ok: false, reason: "ASSET_NOT_AVAILABLE" };

    const { url, expiresAt } = await this.storage.getPreviewUrl(previewAsset.storageKey);
    return { ok: true, url, expiresAt, fileName: previewAsset.fileName, mimeType: previewAsset.mimeType };
  }
}
