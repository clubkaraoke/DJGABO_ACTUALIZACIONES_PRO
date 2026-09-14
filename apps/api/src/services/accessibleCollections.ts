import { eq, and, or, isNull, gt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { collections, userCollectionAccess } from "../db/schema.js";

/** IDs de colecciones activas a las que el usuario tiene acceso vigente. ADMIN ve todas las activas. */
export async function getAccessibleCollectionIds(db: Db, userId: string, role: string): Promise<string[]> {
  if (role === "ADMIN") {
    const all = await db.query.collections.findMany({ where: eq(collections.active, true) });
    return all.map((c) => c.id);
  }

  const now = new Date();
  const accesses = await db
    .select({ collectionId: userCollectionAccess.collectionId })
    .from(userCollectionAccess)
    .innerJoin(collections, eq(collections.id, userCollectionAccess.collectionId))
    .where(
      and(
        eq(userCollectionAccess.userId, userId),
        eq(userCollectionAccess.enabled, true),
        eq(collections.active, true),
        or(isNull(userCollectionAccess.expiresAt), gt(userCollectionAccess.expiresAt, now)),
      ),
    );
  return accesses.map((a) => a.collectionId);
}
