import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { assets, karaokes } from "../db/schema.js";

/**
 * The public VIP catalogue must match the real provider-backed monthly JSON.
 * Keep legacy/mock records for audit but never count or expose them as active
 * Dropbox files when the live storage provider is Dropbox.
 */
export function liveCatalogKaraoke(db:Db,provider:"mock"|"dropbox"){
  return and(
    eq(karaokes.catalogActive,true),
    inArray(karaokes.masterAssetId,
      db.select({id:assets.id}).from(assets).where(eq(assets.provider,provider))
    ),
  )!;
}
