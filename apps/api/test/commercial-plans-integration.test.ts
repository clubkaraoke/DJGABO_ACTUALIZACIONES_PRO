import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildTestApp, type TestFixtures } from "./testApp.js";
import { collections, plans, userCollectionAccess, userDownloadCollections, users } from "../src/db/schema.js";
import { getAccessibleCollectionIds } from "../src/services/accessibleCollections.js";
import { createId } from "../src/db/id.js";

describe("Commercial plan authorization and renewal (SQLite integration)", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let annualId = "";
  let sixId = "";
  let monthlyId = "";
  let january2027 = "";
  let april2027 = "";
  let december2025 = "";
  let fourth2026 = "";

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    const db = app.db;
    const commercial = await db.query.plans.findMany();
    annualId = commercial.find((p) => p.slug === "pro-anual")!.id;
    sixId = commercial.find((p) => p.slug === "pro-semestral")!.id;
    monthlyId = commercial.find((p) => p.slug === "pro-mensual")!.id;
    const stamp = new Date();
    for (const [y, m, label] of [[2025, 12, "y2025"], [2027, 1, "y2027jan"], [2027, 4, "y2027apr"], [2026, 9, "extra2026"]] as const) {
      const id = createId("col");
      await db.insert(collections).values({
        id, slug: label, title: label, year: y, month: m,
        storagePath: "/" + label, updatedAt: stamp, createdAt: stamp, active: true,
      });
      if (label === "y2025") december2025 = id;
      if (label === "y2027jan") january2027 = id;
      if (label === "y2027apr") april2027 = id;
      if (label === "extra2026") fourth2026 = id;
    }
  });
  afterAll(async () => { await app.close(); });

  it("grants annual years automatically without manually inserting grants; manual block is respected", async () => {
    await app.db.update(users).set({
      planId: annualId, subscriptionStart: new Date("2026-09-15T00:00:00Z"),
      subscriptionEnd: new Date("2027-09-15T00:00:00Z"),
    }).where(eq(users.id, fixtures.activeUserId));
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(true);
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, january2027)).allowed).toBe(true);
    expect(await getAccessibleCollectionIds(app.db, fixtures.activeUserId, "MEMBER")).toContain(december2025);
    await app.db.insert(userCollectionAccess).values({
      id: createId("access"), userId: fixtures.activeUserId, collectionId: december2025,
      grantedAt: new Date(), enabled: false,
    });
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(false);
    await app.db.delete(userCollectionAccess).where(eq(userCollectionAccess.collectionId, december2025));
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(true);
  });

  it("six month tier grants purchase year and next months but not older years or beyond term", async () => {
    await app.db.update(users).set({
      planId: sixId, subscriptionStart: new Date("2026-09-15T00:00:00Z"),
      subscriptionEnd: new Date("2027-03-15T00:00:00Z"),
    }).where(eq(users.id, fixtures.activeUserId));
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, fixtures.collectionAllowedId)).allowed).toBe(true);
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, january2027)).allowed).toBe(true);
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(false);
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, april2027)).allowed).toBe(false);
    // Old explicit grants must never bypass the new commercial entitlement.
    await app.db.insert(userCollectionAccess).values({
      id: createId("access"), userId: fixtures.activeUserId, collectionId: december2025,
      enabled: true, grantedAt: new Date(),
    });
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(false);
  });

  it("monthly selection limit of three resets when subscription start is renewed", async () => {
    const today = new Date();
    const start = new Date(today.getTime() - 86_400_000);
    const end = new Date(today.getTime() + 29 * 86_400_000);
    await app.db.update(users).set({
      planId: monthlyId, subscriptionStart: start, subscriptionEnd: end,
    }).where(eq(users.id, fixtures.activeUserId));
    expect((await app.authorizationService.canAccessCollection(fixtures.activeUserId, december2025)).allowed).toBe(false);
    const chosen = [fixtures.collectionAllowedId, fixtures.collectionBlockedId, fixtures.collectionArchiveId];
    for (const collectionId of chosen) {
      await app.db.insert(userDownloadCollections).values({
        id: createId("sel"), userId: fixtures.activeUserId, collectionId, selectedAt: new Date(today.getTime() - 10_000),
      });
    }
    const before = await app.inject({
      method: "GET",
      url: "/api/downloads/collection/" + fourth2026 + "/status",
      headers: { authorization: "Bearer " + (await app.inject({
        method: "POST", url: "/api/auth/login", payload: { email: "active@test.local", password: "Test1234!" },
      })).json().accessToken },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().maxSelectedCollections).toBe(3);
    expect(before.json().canDownload).toBe(false);
    expect(before.json().denialReason).toBe("COLLECTION_SELECTION_LIMIT_REACHED");
    // A later renewal changes the contract start date, not the daily anti-abuse quota.
    const nextStart = new Date(today.getTime() - 1000);
    await app.db.update(users).set({
      subscriptionStart: nextStart,
      subscriptionEnd: new Date(nextStart.getTime() + 30 * 86_400_000),
    }).where(eq(users.id, fixtures.activeUserId));
    const token = (await app.inject({
      method: "POST", url: "/api/auth/login", payload: { email: "active@test.local", password: "Test1234!" },
    })).json().accessToken;
    const after = await app.inject({
      method: "GET", url: "/api/downloads/collection/" + fourth2026 + "/status",
      headers: { authorization: "Bearer " + token },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().canDownload).toBe(true);
    const remaining = await app.db.query.userDownloadCollections.findMany({ where: eq(userDownloadCollections.userId, fixtures.activeUserId) });
    expect(remaining.length).toBe(0);
  });
});
