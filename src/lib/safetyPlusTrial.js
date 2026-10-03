// src/lib/safetyPlusTrial.js
//
// Resolves the Safety Plus free trial for surfaces that have no offerings of
// their own (the dashboard nudge). Returns { days, priceString } or null; null
// means "make no free claim", and every failure path lands there (I4).
//
// It reads the ANNUAL package because that is what /plans preselects — the
// screen the nudge's button opens. It never substitutes another billing period.
// A user with a redeemed referral gets the referral offer at purchase, not the
// trial, so they get no claim. getOfferings() is already the I3 chokepoint: it
// makes no RevenueCat call in a decoy/demo session, on web, or off native.

import { getOfferings, SAFETY_PLUS_ANNUAL_PACKAGE } from '@/lib/purchases';
import { checkIntroTrialEligibility } from '@/lib/introTrialEligibility';
import { freeTrialDays } from '@/lib/freeTrial';

// How long a surface will wait for the store before it shows its normal copy.
export const TRIAL_LOOKUP_BUDGET_MS = 1200;

/**
 * loadSafetyPlusTrial with a time limit, for a surface that is about to appear:
 * it must not hold the screen on a slow network, and it must never claim "free"
 * on an answer that arrives late. Past the budget the answer is null.
 */
export function loadSafetyPlusTrialWithin(budgetMs, args) {
  let timer;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  return Promise.race([loadSafetyPlusTrial(args), budget])
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

export async function loadSafetyPlusTrial({ platform, hasReferral }) {
  if (hasReferral) return null;
  try {
    const offering = await getOfferings();
    const pkg = offering?.availablePackages?.find(
      (p) => p?.identifier === SAFETY_PLUS_ANNUAL_PACKAGE,
    );
    if (!pkg) return null;
    const iosEligible = platform === 'ios' ? await checkIntroTrialEligibility(pkg) : false;
    const days = freeTrialDays(pkg, { platform, iosEligible });
    if (days == null) return null;
    return { days, priceString: pkg.product?.priceString ?? null };
  } catch {
    return null;
  }
}
