import { eq, and, ne, count } from "drizzle-orm";
import type {
  AuthorizationRepositoryPort,
  AuthUserRecord,
  AuthCollectionRecord,
  AuthKaraokeRecord,
  AuthAccessRecord,
} from "@djgabo/domain";
import type { Role, UserStatus } from "@djgabo/shared";
import type { Db } from "./client.js";
import { users, plans, collections, karaokes, userCollectionAccess, deviceSessions } from "./schema.js";
import { commercialTier, commercialCollectionAllowed } from "../services/commercialPlans.js";

/**
 * Adaptador Drizzle del puerto que necesita AuthorizationService. El dominio
 * (packages/domain) no importa Drizzle ni SQL; esta clase es el único puente.
 */
export class DrizzleAuthorizationRepository implements AuthorizationRepositoryPort {
  constructor(private readonly db: Db) {}

  async getUser(userId: string): Promise<AuthUserRecord | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return null;
    return {
      id: user.id,
      role: user.role as Role,
      status: user.status as UserStatus,
      subscriptionEnd: user.subscriptionEnd,
      maxDevices: user.maxDevices,
    };
  }

  async getCollection(collectionId: string): Promise<AuthCollectionRecord | null> {
    const collection = await this.db.query.collections.findFirst({ where: eq(collections.id, collectionId) });
    if (!collection) return null;
    return { id: collection.id, active: collection.active };
  }

  async getKaraoke(karaokeId: string): Promise<AuthKaraokeRecord | null> {
    const karaoke = await this.db.query.karaokes.findFirst({ where: eq(karaokes.id, karaokeId) });
    if (!karaoke) return null;
    return {
      id: karaoke.id,
      collectionId: karaoke.collectionId,
      masterAssetId: karaoke.masterAssetId,
      previewAssetId: karaoke.previewAssetId,
    };
  }

  async getAccess(userId: string, collectionId: string): Promise<AuthAccessRecord | null> {
    const access = await this.db.query.userCollectionAccess.findFirst({
      where: and(eq(userCollectionAccess.userId, userId), eq(userCollectionAccess.collectionId, collectionId)),
    });
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    const plan = user?.planId ? await this.db.query.plans.findFirst({ where: eq(plans.id, user.planId) }) : null;
    const tier = commercialTier(plan?.slug);
    if (!tier) {
      return access ? { enabled: access.enabled, expiresAt: access.expiresAt } : null;
    }
    const collection = await this.db.query.collections.findFirst({ where: eq(collections.id, collectionId) });
    if (!user || !collection || !commercialCollectionAllowed(tier, user, collection)) {
      return { enabled: false, expiresAt: null };
    }
    if (access?.enabled === false) return { enabled: false, expiresAt: null };
    if (access?.expiresAt && access.expiresAt.getTime() < Date.now()) {
      return { enabled: false, expiresAt: null };
    }
    return { enabled: true, expiresAt: null };
  }

  async countOtherActiveDevices(userId: string, deviceId: string | null): Promise<number> {
    const where = deviceId
      ? and(eq(deviceSessions.userId, userId), eq(deviceSessions.active, true), ne(deviceSessions.deviceId, deviceId))
      : and(eq(deviceSessions.userId, userId), eq(deviceSessions.active, true));
    const [row] = await this.db.select({ value: count() }).from(deviceSessions).where(where);
    return row?.value ?? 0;
  }

  async isDeviceKnown(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.db.query.deviceSessions.findFirst({
      where: and(eq(deviceSessions.userId, userId), eq(deviceSessions.deviceId, deviceId)),
    });
    return Boolean(device?.active);
  }
}
