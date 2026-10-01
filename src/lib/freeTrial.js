// src/lib/freeTrial.js
//
// Display helpers for the Safety Plus free trial. "N days free" is a claim about
// what the store will charge, so it is derived ONLY from what the store itself
// reports for the package being bought — a zero-price phase of a stated length —
// never from a constant. Anything unverified returns null and the caller keeps
// its normal price-only copy (I4: fail honest).
//
// Android: the trial is a Play subscription option named by tag. Play only
// exposes that option to a client that is server-side eligible (a new
// subscriber), so finding it IS the eligibility check.
//
// iOS: the trial is an App Store introductory offer that StoreKit applies
// automatically at purchase. The package always carries `introPrice`, even for
// a user who has already used it, so it proves nothing about THIS user. Callers
// must pass `iosEligible: true` from a positive eligibility check
// (purchases.js `checkIntroTrialEligibility`); unknown counts as ineligible.

// Play Store offer tag for the 14-day free trial. See the `rc-ignore-offer`
// note in purchases.js for why an offer must be named by tag on Android.
export const PLAY_FREE_TRIAL_OFFER_TAG = 'free-trial-14d';

const DAYS_PER_WEEK = 7;

// Day count for a free period, or null when it is not expressible in whole days.
function daysIn(unit, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  switch (String(unit ?? '').toUpperCase()) {
    case 'DAY': return n;
    case 'WEEK': return n * DAYS_PER_WEEK;
    default: return null;
  }
}

function playTrialDays(pkg) {
  const options = pkg?.product?.subscriptionOptions;
  if (!Array.isArray(options)) return null;
  const option = options.find(
    (o) => Array.isArray(o?.tags) && o.tags.includes(PLAY_FREE_TRIAL_OFFER_TAG),
  );
  const phase = option?.freePhase;
  if (!phase || phase.price?.amountMicros !== 0) return null;
  return daysIn(phase.billingPeriod?.unit, phase.billingPeriod?.value);
}

function iosTrialDays(pkg, iosEligible) {
  if (iosEligible !== true) return null;
  const intro = pkg?.product?.introPrice;
  if (!intro || intro.price !== 0 || intro.cycles !== 1) return null;
  return daysIn(intro.periodUnit, intro.periodNumberOfUnits);
}

/**
 * @param {object|null|undefined} pkg RevenueCat package that would be purchased
 * @param {{ platform?: string, iosEligible?: boolean }} [ctx]
 * @returns {number|null} whole free days, or null when no verified free trial
 */
export function freeTrialDays(pkg, { platform, iosEligible } = {}) {
  if (!pkg) return null;
  if (platform === 'android') return playTrialDays(pkg);
  if (platform === 'ios') return iosTrialDays(pkg, iosEligible);
  return null;
}

export function trialHeadline(days) {
  return `${days} ${days === 1 ? 'day' : 'days'} free`;
}

export function trialCtaLabel(days) {
  return `Start ${days}-day free trial`;
}

// The store requires the post-trial price to be stated at the point of purchase.
export function trialRenewalLine({ days, priceString, billing }) {
  const period = billing === 'annual' ? 'year' : 'month';
  return (
    `${trialHeadline(days)}, then ${priceString ?? 'the store price'}/${period}. ` +
    'Cancel any time before the trial ends and you will not be charged.'
  );
}
