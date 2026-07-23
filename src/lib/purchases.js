//
// Thin wrapper around the RevenueCat Capacitor plugin. Native platforms only —
// Apple/Google in-app purchase does not exist on web (web stays testing-only;
// see CLAUDE.md). Every export is a safe no-op on web so callers never need
// their own isNativePlatform() check.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

export const SAFETY_PLUS_ENTITLEMENT = 'safety_plus';

// RevenueCat standard package identifiers for the Safety Plus offering. Both
// packages grant the SAME entitlement (`safety_plus`) — annual is a pricing
// choice, not a feature difference. If a store/offering doesn't carry one of
// these yet (staged rollout), Subscription.jsx falls back to whichever is
// present — never crash, never surface a broken purchase button (I4).
export const SAFETY_PLUS_MONTHLY_PACKAGE = '$rc_monthly';
export const SAFETY_PLUS_ANNUAL_PACKAGE = '$rc_annual';

// Offering used for the cancel-intent retention offer (components/subscription/
// CancelOfferDialog.jsx). Resolved via getTierOffering() and absent by default:
// until a promotional offer is configured in App Store Connect AND Play Console
// and attached to an offering with this identifier, this returns null and the
// dialog shows no price — which is correct. Apple and Google sell only from
// their own price points, so a discount cannot be produced client-side; the
// displayed figure must be whatever the store returns.
export const RETENTION_OFFERING_ID = 'retention';

// Google Play offers are NOT selected by RevenueCat for us. Every Veyrnox offer
// carries the `rc-ignore-offer` tag, which stops the SDK auto-applying it to a
// full-price subscriber — so the discount only ever exists if WE ask for it by
// tag. That tag equals the offering id by construction: the Play offer tagged
// `referral-gold` lives behind the offering `referral-gold`.
//
// Why this is not optional: all five offers (four referral tiers + retention)
// sit on the SAME base plan. Purchasing the package without naming an option
// lets the store decide which of them applies — the exact "looks configured,
// charges wrong" failure this indirection exists to prevent.
export function findOfferOption(pkg, offerTag) {
  if (!offerTag) return null;
  const options = pkg?.product?.subscriptionOptions;
  if (!Array.isArray(options)) return null;
  return options.find(
    (o) => Array.isArray(o?.tags) && o.tags.includes(offerTag)
  ) ?? null;
}

// ---------------------------------------------------------------------------
// App Store promotional offers
//
// iOS is a DIFFERENT mechanism from Play, not a different spelling of one.
// Play exposes `product.subscriptionOptions[]` matched by tag; Apple exposes
// `product.discounts[]` matched by identifier, which RevenueCat must SIGN
// (getPromotionalOffer) before purchaseDiscountedPackage will accept it. The
// plugin types say so explicitly: `discounts` is "Null for Android", and
// subscriptionOptions/tags do not exist on an App Store product.
//
// The identifiers cannot match Play's either. App Store Connect scopes offer
// identifiers to the whole SUBSCRIPTION GROUP (so monthly and annual cannot
// share one) and rejects hyphens. Hence this explicit table rather than a
// string transform: `retention` is asymmetric because the monthly offer was
// created first and took the unsuffixed id, and Apple burns identifiers
// permanently — they cannot be renamed to be tidy.
//
// Unknown offering or unknown package → null → the caller fails closed. A
// derived-by-guessing identifier is the one outcome worth avoiding here: it
// would either be rejected at purchase or, worse, apply the wrong duration's
// price.
export const APPLE_OFFER_IDS = {
  'referral-bronze':   { monthly: 'referral_bronze_monthly',   annual: 'referral_bronze_annual' },
  'referral-silver':   { monthly: 'referral_silver_monthly',   annual: 'referral_silver_annual' },
  'referral-gold':     { monthly: 'referral_gold_monthly',     annual: 'referral_gold_annual' },
  'referral-platinum': { monthly: 'referral_platinum_monthly', annual: 'referral_platinum_annual' },
  'retention':         { monthly: 'retention_50',              annual: 'retention_50_annual' },
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

// Exact identifier match only. `retention_50` is a strict prefix of
// `retention_50_annual`, so any prefix/substring matching would apply the
// 3-month monthly offer to an annual purchase.
export function findAppleDiscount(pkg, appleOfferId) {
  if (!appleOfferId) return null;
  const discounts = pkg?.product?.discounts;
  if (!Array.isArray(discounts)) return null;
  return discounts.find((d) => d?.identifier === appleOfferId) ?? null;
}

// The PRICE the customer will actually be charged for a given offer.
//
// `pkg.product.priceString` is the BASE plan price on both stores — never the
// offer price. A referral package and the full-price package wrap the SAME
// product (`safety_plus_monthly`), so reading priceString off the "discounted"
// package yields $5.99 either way. That is what put a struck-through "$5.99
// $5.99" under a "Stay for less" headline in the cancel dialog.
//
// The real figure lives in different places per store:
//   iOS     — the matching entry in `product.discounts[]`
//   Android — the `introPhase` of the matching subscription option (the
//             discounted recurring phase; `fullPricePhase` is what follows)
//
// Returns null when no offer applies or the price cannot be read. Callers must
// render nothing rather than fall back to the base price (I4): showing a
// crossed-out price beside an identical one is a false claim of a saving.
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

let configured = false;

function isNative() {
  return Capacitor.isNativePlatform() === true;
}

function apiKeyForPlatform() {
  return Capacitor.getPlatform() === 'ios'
    ? import.meta.env.VITE_REVENUECAT_APPLE_API_KEY
    : import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
}

export async function configurePurchases() {
  if (!isNative() || configured) return;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) throw new Error('REVENUECAT_API_KEY_MISSING');
  await Purchases.configure({ apiKey });
  // LOG-1 defence-in-depth: RevenueCat's default log level (INFO in release,
  // DEBUG in debug builds) echoes SDK activity — including customer-info dumps
  // — to logcat / os_log. Same class of leak the Capacitor bridge redaction
  // patch closed in PR #572. Force ERROR on release so only genuine failures
  // are logged; dev builds keep the default verbose logs for debugging.
  // Fail open — logging is non-critical, a rejection here must not break the
  // purchase flow (I4 boundary: configure() completing IS the security-relevant
  // event; logging quietness is best-effort hardening).
  if (import.meta.env.PROD) {
    try { await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR }); } catch { /* best-effort */ }
  }
  configured = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { current } = await Purchases.getOfferings();
  return current ?? null;
}

export async function getTierOffering(offeringId) {
  if (!isNative() || !offeringId) return null;
  try {
    const { all } = await Purchases.getOfferings();
    return all?.[offeringId] ?? null;
  } catch {
    return null;
  }
}

// `offerTag` names a Play offer that MUST be applied for this purchase to be
// the price the user was shown (a referral tier, or the cancel-save offer).
//
// Fails closed (I4): if a tag was required and the store doesn't carry a
// matching option, we throw rather than fall through to purchasePackage. That
// path would charge FULL price after showing a discount — silently, and only
// discoverable on the customer's statement. A failed purchase the user can
// retry is strictly better than a wrong charge they can't see.
export const OFFER_UNAVAILABLE = 'OFFER_UNAVAILABLE';

function offerUnavailable(offerTag) {
  const err = /** @type {Error & { code?: string }} */ (
    new Error(`Offer "${offerTag}" is not available on this product`)
  );
  err.code = OFFER_UNAVAILABLE;
  return err;
}

/**
 * @param {any} pkg
 * @param {{ offerTag?: string | null }} [opts]
 */
export async function purchasePackage(pkg, opts = {}) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const offerTag = opts?.offerTag;

  if (offerTag) {
    if (Capacitor.getPlatform() === 'ios') {
      const discount = findAppleDiscount(pkg, appleOfferIdFor(offerTag, pkg));
      if (!discount) throw offerUnavailable(offerTag);

      // RevenueCat signs the offer server-side from the In-App Purchase key.
      // Anything other than a signed offer coming back — undefined, or a
      // rejection — must abort. Falling through to purchasePackage would
      // charge FULL price after the paywall promised a discount.
      let signedOffer;
      try {
        signedOffer = await Purchases.getPromotionalOffer({
          product: pkg.product,
          discount,
        });
      } catch {
        throw offerUnavailable(offerTag);
      }
      if (!signedOffer) throw offerUnavailable(offerTag);

      const { customerInfo } = await Purchases.purchaseDiscountedPackage({
        aPackage: pkg,
        discount: signedOffer,
      });
      return customerInfo;
    }

    const subscriptionOption = findOfferOption(pkg, offerTag);
    if (!subscriptionOption) throw offerUnavailable(offerTag);
    const { customerInfo } = await Purchases.purchaseSubscriptionOption({
      subscriptionOption,
    });
    return customerInfo;
  }

  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}

export async function restorePurchases() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

export async function addCustomerInfoUpdateListener(callback) {
  if (!isNative()) return () => {};
  const listenerId = await Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
}

// Tag the RC customer with a referral code so attribution is visible in the
// RevenueCat dashboard alongside revenue data. Best-effort — a failure here
// must never block the purchase flow or surface an error to the user.
// Owner override 2026-07-18: setAttributes was previously on the "do not add"
// list (identity leak concern); unlocked for referral-code-only attribution.
// The referral code identifies the REFERRER, not the purchaser — no wallet
// address, seed, or balance is ever sent. I3-gated at the call site
// (Subscription.jsx only calls this after a successful real-session purchase).
export async function setReferralAttribute(code) {
  if (!isNative() || !configured || !code) return;
  try {
    await Purchases.setAttributes({ referralCode: code });
  } catch { /* best-effort */ }
}

// Deep-link to the platform's own subscription management page (Apple: App Store
// Subscriptions; Google: Play Store Subscriptions). The Capacitor RC plugin does
// not expose the native SDK's `showManageSubscriptions`, so this uses the
// documented OS URL scheme via `@capacitor/app`. Zero egress from our code — the
// native handler opens the OS surface; no RevenueCat call. No-op on web.
export async function manageSubscription() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const url = Capacitor.getPlatform() === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  // @capacitor/app@8.x's public TS surface does not include `openUrl`
  // (it exposes lifecycle events + getLaunchUrl only). The method exists on
  // the underlying native plugin bridge; PR #1085's own runbook flags the
  // device-verify of this deep-link as outstanding. Silence the typecheck
  // here without changing the runtime call — if a future @capacitor/app
  // release adds `openUrl` to the plugin type, this pragma will fail the
  // build and prompt its removal.
  // @ts-expect-error TS2339 — App.openUrl runtime-only in @capacitor/app@8.x
  await App.openUrl({ url });
}
