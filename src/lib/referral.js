import { registerCode } from '@/api/referralApi';

const STORAGE_KEY = 'veyrnox-referral';
const PENDING_KEY = 'veyrnox-referral-pending';

export const EXTERNAL_REWARD_URL =
  import.meta.env.VITE_REFERRAL_REWARD_URL ||
  'mailto:rewards@veyrnox.com?subject=Referral%20Reward%20Claim';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return 'VYX-' + Array.from(arr, (b) => CHARS[b % CHARS.length]).join('');
}

// P1 (I3) — EPHEMERAL DISPLAY CODE for a deniability (decoy/hidden) or demo
// session. ReferralTracker must not read the real code out of `veyrnox-referral`
// under coercion, and must not CREATE one either (generateCode() writes the shared
// key, so merely opening the page in a decoy session mutated real state).
//
// The honest substitute is a code that (a) looks exactly like a genuine new
// user's, (b) is never persisted anywhere — module scope only, so it leaves no
// forensic artifact and dies with the tab, and (c) is STABLE for the life of the
// tab: regenerating per mount would let a coercer notice the code changing
// between visits, which is itself a tell.
/** @type {string | null} */
let _ephemeralCode = null;

export function getEphemeralCode() {
  if (!_ephemeralCode) _ephemeralCode = randomCode();
  return _ephemeralCode;
}

export function getLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Codex P2 2026-08-15: registerCode now returns the code the server actually
// registered (or null). If it differs from the locally-minted attempt — a
// collision the SQL layer resolved server-side — overwrite local state so
// the user never displays a code that belongs to someone else. Runs async;
// the return value below is the immediate optimistic value.
function reconcileRegisteredCode(attempted) {
  registerCode(attempted).then((working) => {
    if (!working || working === attempted) return;
    const cur = getLocalState();
    // Only overwrite if the local state still holds the attempted code
    // — a concurrent successful server-side flow may have already
    // updated it, in which case do nothing.
    if (cur.code === attempted) {
      saveState({ ...cur, code: working });
    }
  }).catch(() => { /* best-effort */ });
}

export function generateCode() {
  const state = getLocalState();
  if (state.code) return state.code;
  const code = randomCode();
  saveState({ ...state, code });
  reconcileRegisteredCode(code);
  return code;
}

export async function initCode(generateServerCode) {
  const state = getLocalState();
  if (state.code) return state.code;
  if (generateServerCode) {
    const serverCode = await generateServerCode();
    if (serverCode) {
      saveState({ ...state, code: serverCode, serverGenerated: true });
      return serverCode;
    }
  }
  const code = randomCode();
  saveState({ ...state, code });
  // Await here so the returned value already reflects any server-side
  // reconciliation — initCode's callers (WalletProvider) already await it.
  const registered = await registerCode(code);
  if (registered && registered !== code) {
    saveState({ ...getLocalState(), code: registered });
    return registered;
  }
  return code;
}

// Tiers are determined by PAID SUBSCRIBER count (not raw referral count).
// A "referral" is anyone who enters the code; a "paid subscriber" is someone
// who actually purchased Safety Plus using the code. Only paid conversions
// drive tier progression and commission earnings.
export const TIERS = [
  { key: 'platinum', label: 'Platinum', min: 10000, max: 100000, commission: 15 },
  { key: 'gold',     label: 'Gold',     min: 1000,  max: 10000,  commission: 10 },
  { key: 'silver',   label: 'Silver',   min: 100,   max: 1000,   commission: 5 },
  { key: 'bronze',   label: 'Bronze',   min: 0,     max: 100,    commission: 2.5 },
];

export function getTier(count) {
  if (count <= 0) return 'none';
  for (const t of TIERS) {
    if (count >= t.min) return t.key;
  }
  return 'bronze';
}

export function getTierInfo(count) {
  if (count <= 0) return { key: 'none', label: 'No referrals yet', commission: 0, next: TIERS[TIERS.length - 1] };
  for (const t of TIERS) {
    if (count >= t.min) {
      const idx = TIERS.indexOf(t);
      return { ...t, next: idx > 0 ? TIERS[idx - 1] : null };
    }
  }
  const bronze = TIERS[TIERS.length - 1];
  return { ...bronze, next: TIERS[TIERS.length - 2] };
}

// paidCount drives tier progression. rawCount is the total referral count
// (anyone who entered the code) — stored for display but NOT used for tier.
export function applyRedemption(rawCount, paidCount) {
  const state = getLocalState();
  const effectivePaid = typeof paidCount === 'number' ? paidCount : rawCount;
  const tier = getTier(effectivePaid);
  const info = getTierInfo(effectivePaid);
  const unlockedFeatures = [...(state.unlockedFeatures || [])];
  if (tier === 'silver' || tier === 'gold' || tier === 'platinum') {
    if (!unlockedFeatures.includes('portfolio-snapshots')) {
      unlockedFeatures.push('portfolio-snapshots');
    }
  }
  const commission = info.commission;
  const externalEligible = tier === 'gold' || tier === 'platinum';
  saveState({ ...state, inviteCount: rawCount, paidCount: effectivePaid, tier, commission, unlockedFeatures, externalEligible });
  return { tier, commission, unlockedFeatures, externalEligible, paidCount: effectivePaid };
}

export function markRedeemed(code) {
  saveState({ ...getLocalState(), redeemedCode: code });
}

export function hasRedeemed() {
  return !!getLocalState().redeemedCode;
}

export function setPendingReferral(code) {
  localStorage.setItem(PENDING_KEY, code);
}

export function getPendingReferral() {
  return localStorage.getItem(PENDING_KEY);
}

export function clearPendingReferral() {
  localStorage.removeItem(PENDING_KEY);
}

export function getRedeemedCode() {
  return getLocalState().redeemedCode || null;
}

export function markAttributed() {
  saveState({ ...getLocalState(), attributed: true });
}

export function hasAttributed() {
  return !!getLocalState().attributed;
}

export const PLAN_FULL_PRICE_CENTS = {
  safety_plus: { monthly: 599, annual: 4999 },
  ai_security_protection: {
    monthly: Number(import.meta.env.VITE_AI_SECURITY_PROTECTION_MONTHLY_PRICE_CENTS) || 0,
    annual: Number(import.meta.env.VITE_AI_SECURITY_PROTECTION_ANNUAL_PRICE_CENTS) || 0,
  },
};
export const PLAN_REVENUE_CENTS = PLAN_FULL_PRICE_CENTS;

export const TIER_OFFERING_ID = {
  safety_plus: {
    bronze:   'referral-bronze',
    silver:   'referral-silver',
    gold:     'referral-gold',
    platinum: 'referral-platinum',
  },
};

export function getOfferingIdForTier(tierKey, planId = 'safety_plus') {
  if (!tierKey || tierKey === 'none') return null;
  const explicit = TIER_OFFERING_ID[planId]?.[tierKey];
  if (explicit) return explicit;
  // AI Security Protection referral offerings are optional and intentionally
  // env-driven until the canonical RevenueCat identifiers are finalized. When
  // absent, the caller fails closed to the base AI price rather than inventing
  // an offering id and surfacing a dead discount path.
  if (planId === 'ai_security_protection') {
    const prefix = import.meta.env.VITE_RC_AI_REFERRAL_OFFERING_PREFIX || null;
    return prefix ? `${prefix}-${tierKey}` : null;
  }
  return null;
}

export function getPlanFullPriceCents(planId, billing) {
  if (planId === 'ai_security_protection') {
    if (billing === 'monthly') {
      return Number(import.meta.env.VITE_AI_SECURITY_PROTECTION_MONTHLY_PRICE_CENTS) || 0;
    }
    if (billing === 'annual') {
      return Number(import.meta.env.VITE_AI_SECURITY_PROTECTION_ANNUAL_PRICE_CENTS) || 0;
    }
  }
  return PLAN_FULL_PRICE_CENTS?.[planId]?.[billing] || 0;
}

export function calculateDiscountCents(fullPriceCents, tierCommission) {
  return Math.round(fullPriceCents * tierCommission / 100);
}

/**
 * Discount actually granted by the store, as USD cents, derived from a RATIO.
 *
 * Branch review 2026-08-15 (C-1). #1808 replaced a tier-commission guess with a
 * price DELTA — but subtracted the store's price (the user's local currency,
 * from offerPriceInfo / product.price) from PLAN_FULL_PRICE_CENTS (hardcoded
 * USD). That subtraction is only meaningful in USD territories: elsewhere a
 * weaker currency makes the charged figure exceed the USD constant and the
 * Math.max(0, …) clamp silently yields 0, while a stronger one yields a
 * positive number that is not a discount.
 *
 * Both inputs here come from the SAME package, so the units cancel and the
 * ratio is dimensionless — correct in every currency without needing a currency
 * code (RevenueCat's offerPriceInfo does not return one). Applying it to the USD
 * full price keeps the result in the same unit as recordAttribution's
 * USD-denominated revenue_cents column.
 *
 * This also captures what a tier percentage cannot: Apple has no price point
 * for small percentages, so a "2.5%" tier is the nearest point at or below
 * target, and FX rounding erases it entirely in some territories (CLAUDE.md
 * 2026-07-23 — Bronze is full price in Albania/Armenia). The ratio reports what
 * the store actually did, including 0.
 *
 * Conservative on every unusable input: a missing, non-finite, zero or negative
 * base price returns 0 rather than a guess. Under-attributing is recoverable;
 * fabricating a discount that never happened inflates a referrer's earnings on
 * paper and is not.
 *
 * @param {unknown} basePrice   the package's REGULAR price, store currency
 * @param {unknown} offerPrice  the price actually charged for the same package
 * @param {number}  fullPriceCents  USD list price for the plan
 * @returns {number} USD cents, 0 <= result <= fullPriceCents
 */
export function storeDiscountCents(basePrice, offerPrice, fullPriceCents) {
  // Reject null/undefined BEFORE coercion: Number(null) is 0, which is finite
  // and non-negative, so a missing offer price would sail through as a 100%
  // discount — the worst possible failure for a value that inflates a
  // referrer's earnings. Caught by this function's own test.
  if (basePrice == null || offerPrice == null) return 0;
  const base = Number(basePrice);
  const offer = Number(offerPrice);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(offer) || offer < 0) return 0;
  if (!Number.isFinite(fullPriceCents) || fullPriceCents <= 0) return 0;
  // Clamp the ratio, not just the output: an offer price ABOVE base (bad store
  // data) must read as "no discount", never as a negative that a later sum
  // would treat as revenue.
  const ratio = Math.min(1, Math.max(0, (base - offer) / base));
  return Math.round(fullPriceCents * ratio);
}

export function calculateEarnings(attributions) {
  const totalDiscountCents = attributions.reduce((sum, a) => sum + (a.discount_cents || 0), 0);
  const totalRevenueCents = attributions.reduce((sum, a) => sum + (a.revenue_cents || 0), 0);
  return { totalRevenueCents, totalDiscountCents, count: attributions.length };
}
