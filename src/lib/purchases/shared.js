import { Capacitor } from '@capacitor/core';

export const SAFETY_PLUS_ENTITLEMENT = 'safety_plus';
export const AI_SECURITY_PROTECTION_ENTITLEMENT = 'ai_security_protection';

export const SAFETY_PLUS_MONTHLY_PACKAGE = '$rc_monthly';
export const SAFETY_PLUS_ANNUAL_PACKAGE = '$rc_annual';
export const RETENTION_OFFERING_ID = 'retention';

export function findOfferOption(pkg, offerTag) {
  if (!offerTag) return null;
  const options = pkg?.product?.subscriptionOptions;
  if (!Array.isArray(options)) return null;
  return options.find(
    (o) => Array.isArray(o?.tags) && o.tags.includes(offerTag)
  ) ?? null;
}

export const APPLE_OFFER_IDS = {
  'referral-bronze':   { monthly: 'referral_bronze_m2',   annual: 'referral_bronze_annual' },
  'referral-silver':   { monthly: 'referral_silver_m2',   annual: 'referral_silver_annual' },
  'referral-gold':     { monthly: 'referral_gold_m2',     annual: 'referral_gold_annual' },
  'referral-platinum': { monthly: 'referral_platinum_m2', annual: 'referral_platinum_annual' },
  'retention':         { monthly: 'retention_50_m2',      annual: 'retention_50_annual' },
};

export function appleOfferIdFor(offeringId, pkg) {
  if (!offeringId) return null;
  const entry = APPLE_OFFER_IDS[offeringId];
  if (!entry) return null;
  const packageId = pkg?.identifier;
  if (packageId === SAFETY_PLUS_MONTHLY_PACKAGE) return entry.monthly;
  if (packageId === SAFETY_PLUS_ANNUAL_PACKAGE) return entry.annual;
  return null;
}

export function findAppleDiscount(pkg, appleOfferId) {
  if (!appleOfferId) return null;
  const discounts = pkg?.product?.discounts;
  if (!Array.isArray(discounts)) return null;
  return discounts.find((d) => d?.identifier === appleOfferId) ?? null;
}

export function offerPriceInfo(pkg, offeringId) {
  if (!pkg || !offeringId) return null;

  if (Capacitor.getPlatform() === 'ios') {
    const discount = findAppleDiscount(pkg, appleOfferIdFor(offeringId, pkg));
    if (!discount) return null;
    const price = Number(discount.price);
    if (!discount.priceString || !Number.isFinite(price)) return null;
    return { priceString: discount.priceString, price };
  }

  const option = findOfferOption(pkg, offeringId);
  const phasePrice = option?.introPhase?.price;
  if (!phasePrice) return null;
  const micros = Number(phasePrice.amountMicros);
  if (!phasePrice.formatted || !Number.isFinite(micros)) return null;
  return { priceString: phasePrice.formatted, price: micros / 1_000_000 };
}

export const OFFER_UNAVAILABLE = 'OFFER_UNAVAILABLE';

export function offerUnavailable(offerTag) {
  const err = /** @type {Error & { code?: string }} */ (
    new Error(`Offer "${offerTag}" is not available on this product`)
  );
  err.code = OFFER_UNAVAILABLE;
  return err;
}

export function getAiSecurityProtectionOfferingId() {
  return import.meta.env.VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID || null;
}

export function currentStoreFlavor() {
  return import.meta.env.VITE_STORE_FLAVOR || 'google';
}
