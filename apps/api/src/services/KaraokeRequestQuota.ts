import { addMonths, commercialTier, membershipActive, membershipDeadline } from "./commercialPlans.js";
import type { CommercialTier } from "./commercialPlans.js";

export interface FreeRequestMembership {
  role: string;
  status: string;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  legacyPendingExpiry?: boolean;
}
export interface ExistingFreeRequest {
  createdAt: string;
  status: "REQUESTED" | "IN_PROGRESS" | "READY" | "REJECTED";
}

export interface FreeRequestQuota {
  active: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export function requestLimit(tier: CommercialTier): number {
  return tier === "MONTH" ? 3 : tier === "SIX_MONTHS" ? 5 : 15;
}

/**
 * Subscription-anniversary billing cycles: 30 days for the monthly plan,
 * monthly anniversaries for the 6/12-month plans. Unused slots do not roll over.
 * Only REQUESTED, IN_PROGRESS and READY requests count, not rejected work.
 */
export function calculateFreeRequestQuota(
  user: FreeRequestMembership,
  tier: CommercialTier | null,
  requests: ExistingFreeRequest[],
  now = new Date(),
  configuredLimit?: number,
): FreeRequestQuota {
  if (user.role === "ADMIN") {
    return { active: true, limit: null, used: 0, remaining: null, periodStart: null, periodEnd: null };
  }
  if (!tier || !membershipActive(user, tier, now) || !user.subscriptionStart) {
    return { active: false, limit: 0, used: 0, remaining: 0, periodStart: null, periodEnd: null };
  }
  const subscriptionEnd = membershipDeadline(tier, user.subscriptionStart, user.subscriptionEnd, user.legacyPendingExpiry)!;
  let periodStart = user.subscriptionStart;
  let periodEnd = tier === "MONTH"
    ? new Date(periodStart.getTime() + 30 * 86_400_000)
    : addMonths(user.subscriptionStart, 1);
  if (tier !== "MONTH") {
    for (let month = 1; month < (tier === "SIX_MONTHS" ? 6 : 12) && now >= periodEnd; month++) {
      periodStart = periodEnd;
      periodEnd = addMonths(user.subscriptionStart, month + 1);
    }
  }
  if (periodEnd > subscriptionEnd) periodEnd = subscriptionEnd;
  const used = requests.filter((item) => {
    if (item.status === "REJECTED") return false;
    const created = Date.parse(item.createdAt);
    return Number.isFinite(created) && created >= periodStart.getTime() && created < periodEnd.getTime();
  }).length;
  const limit = configuredLimit ?? requestLimit(tier);
  return {
    active: true,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

export function commercialRequestTier(slug: string | null | undefined): CommercialTier | null {
  return commercialTier(slug);
}
