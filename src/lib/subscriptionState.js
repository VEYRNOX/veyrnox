// Subscription LIFECYCLE state (active / cancelled / billing retry / expired)
// derived from RevenueCat customer info. DISPLAY ONLY.
//
// This module never decides access. Feature gating stays in entitlement.js
// (`resolveTier`, fail-closed, I3-guarded). Nothing here may widen what a tier
// can do, and a missing or unreadable value here must never change a gate.
//
// Why a persisted record at all: RevenueCat stops listing an entitlement once it
// expires, so "expired" is only knowable as "was paid before, is free now". We keep
// the last paid tier + expiry for that message alone. It is deliberately NOT used to
// keep premium features on during a store outage: a self-editable local value that
// unlocks features is a self-upgrade hole (see entitlement.js FORCED_TIER history).
// Offline continuity for gating is whatever RevenueCat's own SDK cache provides.
//
// I3: the record is a tell that the device held a paid plan, so it is never written
// in a deniability/demo session and is listed in panic.js ALL_RESIDUE_KEYS.

import {
  getCustomerInfo,
  SAFETY_PLUS_ENTITLEMENT,
  AI_SECURITY_PROTECTION_ENTITLEMENT,
} from './purchases';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export const LAST_PAID_KEY = 'veyrnox-last-paid-sub';

export const SUBSCRIPTION_STATUS = Object.freeze({
  NONE: 'none',
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  BILLING_RETRY: 'billing_retry',
  EXPIRED: 'expired',
});

export const NO_SUBSCRIPTION = Object.freeze({
  status: SUBSCRIPTION_STATUS.NONE,
  tier: 'free',
  expiresAt: null,
});

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function parseDate(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Lifecycle detail of the ACTIVE paid entitlement in a RevenueCat customerInfo,
 * or null when none is active. AI Security Protection wins, same precedence as
 * resolveTier(). Own-property + isActive checks mirror entitlement.js.
 */
export function describeSubscription(customerInfo) {
  const active = customerInfo?.entitlements?.active ?? {};
  const pick = (id, tier) => {
    if (!own(active, id)) return null;
    const ent = active[id];
    if (!ent || ent.isActive !== true) return null;
    /** @type {string} */
    let status = SUBSCRIPTION_STATUS.ACTIVE;
    if (ent.billingIssueDetectedAt) status = SUBSCRIPTION_STATUS.BILLING_RETRY;
    else if (ent.willRenew === false) status = SUBSCRIPTION_STATUS.CANCELLED;
    return { status, tier, expiresAt: parseDate(ent.expirationDate) };
  };
  return (
    pick(AI_SECURITY_PROTECTION_ENTITLEMENT, 'ai_security_protection') ||
    pick(SAFETY_PLUS_ENTITLEMENT, 'safety_plus')
  );
}

/** View state for a detail, or for "RevenueCat answered, nothing active". */
export function deriveSubscriptionView(detail, lastPaid) {
  if (detail) return detail;
  if (lastPaid) {
    return {
      status: SUBSCRIPTION_STATUS.EXPIRED,
      tier: 'free',
      expiresAt: lastPaid.expiresAt ?? null,
      lastTier: lastPaid.tier,
    };
  }
  return NO_SUBSCRIPTION;
}

export function readLastPaid() {
  try {
    const raw = localStorage.getItem(LAST_PAID_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || (v.tier !== 'safety_plus' && v.tier !== 'ai_security_protection')) return null;
    return { tier: v.tier, expiresAt: Number.isFinite(v.expiresAt) ? v.expiresAt : null };
  } catch {
    return null;
  }
}

export function writeLastPaid(detail) {
  if (!detail || isDeniabilityOrDemoActive()) return; // I3: no tell in a decoy/demo session
  try {
    localStorage.setItem(
      LAST_PAID_KEY,
      JSON.stringify({ tier: detail.tier, expiresAt: detail.expiresAt ?? null }),
    );
  } catch {
    /* storage unavailable: the expired message is best-effort */
  }
}

/**
 * Reads customer info for DISPLAY. `reachable:false` means the store/RevenueCat
 * could not be read, which must never be shown as "expired" (store problem, not
 * loss of the plan). I3: no call at all in a deniability/demo session.
 */
export async function resolveSubscriptionDetail() {
  if (isDeniabilityOrDemoActive()) return { reachable: false, detail: null };
  try {
    const info = await getCustomerInfo();
    return { reachable: true, detail: describeSubscription(info) };
  } catch {
    return { reachable: false, detail: null };
  }
}
