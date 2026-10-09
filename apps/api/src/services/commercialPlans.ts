import type { Db } from "../db/client.js";
import { plans } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type CommercialTier = "MONTH" | "SIX_MONTHS" | "YEAR";

export function commercialTier(slug: string | null | undefined): CommercialTier | null {
  switch (slug) {
    case "pro-mensual": return "MONTH";
    case "pro-semestral": return "SIX_MONTHS";
    case "pro-anual": return "YEAR";
    default: return null;
  }
}

export function addMonths(start: Date, months: number): Date {
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return target;
}

export function membershipDeadline(
  tier: CommercialTier,
  start: Date | null,
  recordedEnd: Date | null,
): Date | null {
  if (!start || !recordedEnd) return null;
  const cap = tier === "MONTH"
    ? new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
    : addMonths(start, tier === "SIX_MONTHS" ? 6 : 12);
  return new Date(Math.min(cap.getTime(), recordedEnd.getTime()));
}

export interface Membership {
  status: string;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
}
export interface EntitledCollection {
  year: number;
  month: number;
  publishedAt?: Date | null;
}

export function membershipActive(user: Membership, tier: CommercialTier, now = new Date()): boolean {
  if (user.status !== "ACTIVE" || !user.subscriptionStart) return false;
  const until = membershipDeadline(tier, user.subscriptionStart, user.subscriptionEnd);
  return !!until && user.subscriptionStart.getTime() <= now.getTime() && now.getTime() < until.getTime();
}

export function commercialCollectionAllowed(
  tier: CommercialTier,
  user: Membership,
  collection: EntitledCollection,
  now = new Date(),
): boolean {
  if (!membershipActive(user, tier, now)) return false;
  const start = user.subscriptionStart!;
  const until = membershipDeadline(tier, start, user.subscriptionEnd)!;
  if (tier === "YEAR") return true;
  if (tier === "MONTH") return collection.year === 2026;
  const purchaseYear = start.getUTCFullYear();
  if (collection.year === purchaseYear) return true;
  if (collection.year < purchaseYear || collection.month < 1 || collection.month > 12) return false;
  const monthStart = new Date(Date.UTC(collection.year, collection.month - 1, 1));
  return monthStart.getTime() < until.getTime()
    && (!collection.publishedAt || collection.publishedAt.getTime() < until.getTime());
}

export const COMMERCIAL_PLANS = [
  { slug: "pro-mensual", name: "1 mes · US$59.99", description: "3 carpetas diferentes de 2026 en 30 días", maxDevices: 2, maxSelectedCollections: 3 },
  { slug: "pro-semestral", name: "6 meses · US$139.99", description: "Año de compra completo y seis meses de novedades", maxDevices: 2, maxSelectedCollections: null },
  { slug: "pro-anual", name: "Pro Anual · US$179.99", description: "Todos los años y nuevas actualizaciones durante 12 meses", maxDevices: 3, maxSelectedCollections: null },
] as const;

/** Ensure commercial choices exist on the persistent Railway DB without affecting user assignments. */
export async function ensureCommercialPlans(db: Db): Promise<void> {
  for (const definition of COMMERCIAL_PLANS) {
    const old = await db.query.plans.findFirst({ where: eq(plans.slug, definition.slug) });
    if (old) {
      await db.update(plans).set({
        name: definition.name,
        description: definition.description,
        active: true,
        maxSelectedCollections: definition.maxSelectedCollections,
        updatedAt: new Date(),
      }).where(eq(plans.id, old.id));
    } else {
      await db.insert(plans).values({
        id: "plan_" + definition.slug,
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        active: true,
        maxDevices: definition.maxDevices,
        maxCollectionDownloadsPerDay: 2,
        maxDistinctCollectionsPerDay: 5,
        maxSelectedCollections: definition.maxSelectedCollections,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  }
}
