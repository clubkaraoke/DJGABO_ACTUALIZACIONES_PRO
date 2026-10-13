import { describe, expect, it } from "vitest";
import { addMonths } from "../src/services/commercialPlans.js";
import { calculateFreeRequestQuota } from "../src/services/KaraokeRequestQuota.js";

const start = new Date("2026-09-15T10:00:00Z");
const active = { role: "MEMBER", status: "ACTIVE", subscriptionStart: start, subscriptionEnd: addMonths(start, 12) };
const req = (date: string, status: "REQUESTED"|"READY"|"IN_PROGRESS"|"REJECTED" = "REQUESTED") => ({ createdAt: date, status });

describe("Free karaoke request quotas per active membership", () => {
  it("monthly allows 3 total, with no carryover", () => {
    const requests = [
      req("2026-09-16T09:00:00Z"), req("2026-09-17T09:00:00Z"),
      req("2026-09-18T09:00:00Z"), req("2026-09-19T09:00:00Z", "REJECTED"),
    ];
    const q = calculateFreeRequestQuota(active, "MONTH", requests, new Date("2026-09-20T09:00:00Z"));
    expect(q).toMatchObject({ active: true, limit: 3, used: 3, remaining: 0 });
  });
  it("six month resets five requests at each subscription anniversary, not calendar month", () => {
    const requests = Array.from({ length: 5 }, (_, i) => req(`2026-09-${16+i}T12:00:00Z`));
    const endSep = calculateFreeRequestQuota(active, "SIX_MONTHS", requests, new Date("2026-10-14T00:00:00Z"));
    expect(endSep).toMatchObject({ limit: 5, used: 5, remaining: 0 });
    const oct = calculateFreeRequestQuota(active, "SIX_MONTHS", requests, new Date("2026-10-15T12:00:00Z"));
    expect(oct).toMatchObject({ limit: 5, used: 0, remaining: 5, periodStart: "2026-10-15T10:00:00.000Z" });
  });
  it("annual allows 15 each month and at most 180 in 12 months", () => {
    const requests = Array.from({ length: 15 }, (_, i) => req(`2026-10-${String(16+i).padStart(2,"0")}T12:00:00Z`, i % 2 ? "IN_PROGRESS" : "READY"));
    const q = calculateFreeRequestQuota(active, "YEAR", requests, new Date("2026-10-31T13:00:00Z"));
    expect(q).toMatchObject({ limit: 15, used: 15, remaining: 0 });
    const following = calculateFreeRequestQuota(active, "YEAR", requests, new Date("2026-11-15T12:00:00Z"));
    expect(following).toMatchObject({ limit: 15, used: 0, remaining: 15 });
  });
  it("suspended, expired or unrecognized memberships cannot claim free orders", () => {
    const date = new Date("2026-10-12T09:00:00Z");
    expect(calculateFreeRequestQuota({ ...active, status: "SUSPENDED" }, "YEAR", [], date).remaining).toBe(0);
    expect(calculateFreeRequestQuota({ ...active, subscriptionEnd: new Date("2026-10-01Z") }, "YEAR", [], date).active).toBe(false);
    expect(calculateFreeRequestQuota(active, null, [], date).active).toBe(false);
  });
  it("the admin exception has unlimited orders", () => {
    expect(calculateFreeRequestQuota({ ...active, role: "ADMIN" }, null, [])).toMatchObject({ limit: null, remaining: null, active: true });
  });
});

