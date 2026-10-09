import { describe, it, expect } from "vitest";
import { commercialCollectionAllowed, commercialTier, membershipDeadline } from "../src/services/commercialPlans.js";

const start = new Date("2026-09-15T00:00:00Z");
const end6 = new Date("2027-03-15T00:00:00Z");
const user = { status: "ACTIVE", subscriptionStart: start, subscriptionEnd: end6 };
const now = new Date("2026-10-08T12:00:00Z");
const c = (year: number, month: number) => ({ year, month });

describe("Commercial membership entitlements", () => {
  it("recognizes only the three commercial plans", () => {
    expect(commercialTier("pro-anual")).toBe("YEAR");
    expect(commercialTier("pro-semestral")).toBe("SIX_MONTHS");
    expect(commercialTier("pro-mensual")).toBe("MONTH");
    expect(commercialTier("basico")).toBeNull();
  });
  it("monthly is always confined to 2026 and requires active membership", () => {
    expect(commercialCollectionAllowed("MONTH", user, c(2026, 3), now)).toBe(true);
    expect(commercialCollectionAllowed("MONTH", user, c(2025, 12), now)).toBe(false);
    expect(commercialCollectionAllowed("MONTH", { ...user, status: "SUSPENDED" }, c(2026, 3), now)).toBe(false);
  });
  it("six-month plan grants full purchase year plus future months before expiry", () => {
    for (let month = 1; month <= 12; month++) expect(commercialCollectionAllowed("SIX_MONTHS", user, c(2026, month), now)).toBe(true);
    expect(commercialCollectionAllowed("SIX_MONTHS", user, c(2025, 12), now)).toBe(false);
    expect(commercialCollectionAllowed("SIX_MONTHS", user, c(2027, 2), now)).toBe(true);
    expect(commercialCollectionAllowed("SIX_MONTHS", user, c(2027, 3), now)).toBe(true);
    expect(commercialCollectionAllowed("SIX_MONTHS", user, c(2027, 4), now)).toBe(false);
    expect(commercialCollectionAllowed("SIX_MONTHS", user, { year: 2027, month: 2, publishedAt: new Date("2027-04-01Z") }, now)).toBe(false);
  });
  it("annual grants all years, expires at the membership end or 12 month cap", () => {
    expect(commercialCollectionAllowed("YEAR", user, c(2012, 0), now)).toBe(true);
    expect(commercialCollectionAllowed("YEAR", user, c(2026, 10), now)).toBe(true);
    expect(commercialCollectionAllowed("YEAR", user, c(2012, 0), new Date("2027-03-15T01:00:00Z"))).toBe(false);
    expect(membershipDeadline("YEAR", start, new Date("2029-01-01Z"))?.toISOString()).toBe("2027-09-15T00:00:00.000Z");
  });
  it("missing dates do not create accidental unbounded grants", () => {
    expect(commercialCollectionAllowed("YEAR", { status: "ACTIVE", subscriptionStart: null, subscriptionEnd: null }, c(2012, 0), now)).toBe(false);
  });
});
