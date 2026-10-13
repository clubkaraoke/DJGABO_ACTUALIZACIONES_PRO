import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestApp, type TestFixtures } from "./testApp.js";
import { users, plans } from "../src/db/schema.js";
import { KaraokeRequestService } from "../src/services/KaraokeRequestService.js";
import type { FastifyInstance } from "fastify";

describe("Atomic karaoke order quotas backed by the persisted request ledger", () => {
  let app: FastifyInstance;
  let fixtures: TestFixtures;
  let tmp = "";
  let service: KaraokeRequestService;

  beforeAll(async () => {
    ({ app, fixtures } = await buildTestApp());
    tmp = await mkdtemp(join(tmpdir(), "djgabo-request-quota-"));
    service = new KaraokeRequestService(app.db, join(tmp, "orders.json"));
    const plan = await app.db.query.plans.findFirst({ where: eq(plans.slug, "pro-mensual") });
    if (!plan) throw new Error("Commercial plan missing from test app");
    await app.db.update(users).set({
      planId: plan.id,
      subscriptionStart: new Date(Date.now() - 60_000),
      subscriptionEnd: new Date(Date.now() + 30*86_400_000 - 60_000),
    }).where(eq(users.id, fixtures.activeUserId));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await rm(tmp, { recursive: true, force: true }); await app.close(); });
  afterEach(() => vi.unstubAllGlobals());

  it("allows only 3 unique pedidos, duplicates are free, and two parallel submissions cannot exceed quota", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get("url") || "";
      const id = new URL(query).searchParams.get("v");
      return { ok: true, json: async () => ({ title: "Original new request " + id, author_name: "Invented Artist" }) };
    }));
    const id = fixtures.activeUserId;
    await service.create(id, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
    await service.create(id, "https://www.youtube.com/watch?v=bbbbbbbbbbb");
    const same = await service.create(id, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
    expect(same.duplicate).toBe(true);
    const results = await Promise.allSettled([
      service.create(id, "https://www.youtube.com/watch?v=ccccccccccc"),
      service.create(id, "https://www.youtube.com/watch?v=ddddddddddd"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await service.getQuota(id)).toMatchObject({ used: 3, remaining: 0, limit: 3 });
    await expect(service.create(id, "https://www.youtube.com/watch?v=eeeeeeeeeee"))
      .rejects.toThrow("KARAOKE_REQUEST_QUOTA_EXHAUSTED");
  });
});
