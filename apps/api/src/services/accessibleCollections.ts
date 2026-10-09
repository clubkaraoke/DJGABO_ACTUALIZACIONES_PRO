import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { collections, plans, userCollectionAccess, users } from "../db/schema.js";
import { commercialTier, commercialCollectionAllowed } from "./commercialPlans.js";

export async function getAccessibleCollectionIds(db: Db, userId: string, role: string): Promise<string[]> {
  const active = await db.query.collections.findMany({ where: eq(collections.active, true) });
  if (role === "ADMIN") return active.map((row) => row.id);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.status !== "ACTIVE" || (user.subscriptionEnd && user.subscriptionEnd.getTime() < Date.now())) return [];
  const plan = user.planId ? await db.query.plans.findFirst({ where: eq(plans.id, user.planId) }) : null;
  const tier = commercialTier(plan?.slug);
  const overrides = await db.query.userCollectionAccess.findMany({ where: eq(userCollectionAccess.userId, userId) });
  const byCollection = new Map(overrides.map((o) => [o.collectionId, o]));

  return active.filter((c) => {
    const override = byCollection.get(c.id);
    if (override?.enabled === false || (override?.expiresAt && override.expiresAt.getTime() < Date.now())) return false;
    if (tier) return commercialCollectionAllowed(tier, user, c);
    return override?.enabled === true;
  }).map((c) => c.id);
}
