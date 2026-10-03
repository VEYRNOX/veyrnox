// Free-trial display helpers. The copy "N days free" is a claim about what the
// store will charge, so every case below that is NOT a verified zero-price
// phase of a stated length must produce null and leave today's copy untouched.
import { describe, it, expect } from 'vitest';
import {
  PLAY_FREE_TRIAL_OFFER_TAG,
  freeTrialDays,
  trialHeadline,
  trialCtaLabel,
  trialRenewalLine,
} from '../freeTrial';

const playPkg = (freePhase, tags = [PLAY_FREE_TRIAL_OFFER_TAG]) => ({
  product: { subscriptionOptions: [{ tags, freePhase }] },
});
const days = (n) => ({
  billingPeriod: { unit: 'DAY', value: n },
  price: { amountMicros: 0 },
});
const iosPkg = (introPrice) => ({ product: { introPrice } });
const iosIntro = (over = {}) => ({
  price: 0,
  cycles: 1,
  periodUnit: 'DAY',
  periodNumberOfUnits: 14,
  ...over,
});

describe('freeTrialDays — Android (Play subscription option)', () => {
  it('reads the length from the tagged option free phase', () => {
    expect(freeTrialDays(playPkg(days(14)), { platform: 'android' })).toBe(14);
  });
  it('converts weeks to days', () => {
    const wk = { billingPeriod: { unit: 'WEEK', value: 2 }, price: { amountMicros: 0 } };
    expect(freeTrialDays(playPkg(wk), { platform: 'android' })).toBe(14);
  });
  it('is null when the user is ineligible (no tagged option exposed)', () => {
    expect(freeTrialDays({ product: { subscriptionOptions: [] } }, { platform: 'android' })).toBeNull();
  });
  it('is null when the option has no free phase', () => {
    expect(freeTrialDays(playPkg(null), { platform: 'android' })).toBeNull();
  });
  it('is null when the "free" phase carries a price', () => {
    const paid = { billingPeriod: { unit: 'DAY', value: 14 }, price: { amountMicros: 990000 } };
    expect(freeTrialDays(playPkg(paid), { platform: 'android' })).toBeNull();
  });
  it('ignores an option that is not the trial tag', () => {
    expect(freeTrialDays(playPkg(days(14), ['referral-gold']), { platform: 'android' })).toBeNull();
  });
  it('is null for a month-or-longer unit (not a day count)', () => {
    const mo = { billingPeriod: { unit: 'MONTH', value: 1 }, price: { amountMicros: 0 } };
    expect(freeTrialDays(playPkg(mo), { platform: 'android' })).toBeNull();
  });
});

describe('freeTrialDays — iOS (introductory offer)', () => {
  it('needs BOTH a free intro and confirmed eligibility', () => {
    expect(freeTrialDays(iosPkg(iosIntro()), { platform: 'ios', iosEligible: true })).toBe(14);
  });
  it('is null when eligibility is false/unknown (never claim free to an ineligible user)', () => {
    expect(freeTrialDays(iosPkg(iosIntro()), { platform: 'ios', iosEligible: false })).toBeNull();
    expect(freeTrialDays(iosPkg(iosIntro()), { platform: 'ios' })).toBeNull();
  });
  it('is null when the intro offer is paid', () => {
    expect(freeTrialDays(iosPkg(iosIntro({ price: 0.99 })), { platform: 'ios', iosEligible: true })).toBeNull();
  });
  it('is null when there is no intro offer', () => {
    expect(freeTrialDays(iosPkg(null), { platform: 'ios', iosEligible: true })).toBeNull();
  });
  it('is null when the free period repeats (cycles > 1)', () => {
    expect(freeTrialDays(iosPkg(iosIntro({ cycles: 2 })), { platform: 'ios', iosEligible: true })).toBeNull();
  });
  it('converts a week-based free intro', () => {
    const i = iosIntro({ periodUnit: 'WEEK', periodNumberOfUnits: 2 });
    expect(freeTrialDays(iosPkg(i), { platform: 'ios', iosEligible: true })).toBe(14);
  });
});

describe('freeTrialDays — other platforms and bad input', () => {
  it('is null on web and for a missing package', () => {
    expect(freeTrialDays(playPkg(days(14)), { platform: 'web' })).toBeNull();
    expect(freeTrialDays(null, { platform: 'android' })).toBeNull();
    expect(freeTrialDays(undefined, { platform: 'ios', iosEligible: true })).toBeNull();
  });
});

describe('copy builders', () => {
  it('headline, singular and plural', () => {
    expect(trialHeadline(14)).toBe('14 days free');
    expect(trialHeadline(1)).toBe('1 day free');
  });
  it('CTA names the trial', () => {
    expect(trialCtaLabel(14)).toBe('Start 14-day free trial');
  });
  it('renewal line states the price after the trial and the cancel condition', () => {
    const line = trialRenewalLine({ days: 14, priceString: '$5.99', billing: 'monthly' });
    expect(line).toContain('14 days free');
    expect(line).toContain('then $5.99/month');
    expect(line).toMatch(/cancel .*before the trial ends/i);
  });
  it('uses /year for annual', () => {
    expect(trialRenewalLine({ days: 14, priceString: '$49.99', billing: 'annual' })).toContain('then $49.99/year');
  });
  it('falls back to "the store price" when the price is unreadable', () => {
    expect(trialRenewalLine({ days: 14, priceString: null, billing: 'monthly' })).toContain('then the store price/month');
  });
});
