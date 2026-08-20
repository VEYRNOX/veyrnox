import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import {
  findOfferOption,
  findAppleDiscount,
  appleOfferIdFor,
  offerUnavailable,
  currentStoreFlavor,
} from './shared.js';

let configured = false;

function isNative() {
  return Capacitor.isNativePlatform() === true;
}

function apiKeyForPlatform() {
  if (Capacitor.getPlatform() === 'ios') {
    return import.meta.env.VITE_REVENUECAT_APPLE_API_KEY;
  }
  if (currentStoreFlavor() === 'samsung') {
    return import.meta.env.VITE_REVENUECAT_SAMSUNG_API_KEY;
  }
  return import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
}

export async function configurePurchases() {
  if (!isNative() || configured) return;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) throw new Error('REVENUECAT_API_KEY_MISSING');
  await Purchases.configure({ apiKey });
  if (import.meta.env.PROD) {
    try { await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR }); } catch { /* best-effort */ }
  }
  configured = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  if (isDeniabilityOrDemoActive()) return null;
  const { current } = await Purchases.getOfferings();
  return current ?? null;
}

export async function getTierOffering(offeringId) {
  if (!isNative() || !offeringId) return null;
  if (isDeniabilityOrDemoActive()) return null;
  try {
    const { all } = await Purchases.getOfferings();
    return all?.[offeringId] ?? null;
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg, opts = {}) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const offerTag = opts?.offerTag;

  if (offerTag) {
    if (Capacitor.getPlatform() === 'ios') {
      const discount = findAppleDiscount(pkg, appleOfferIdFor(offerTag, pkg));
      if (!discount) throw offerUnavailable(offerTag);

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

export async function getAppUserId() {
  if (!isNative()) return null;
  try {
    const info = await getCustomerInfo();
    return info?.originalAppUserId ?? null;
  } catch {
    return null;
  }
}

export async function addCustomerInfoUpdateListener(callback) {
  if (!isNative()) return () => {};
  const listenerId = await Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
}

export async function setReferralAttributes(code, tierKey, isFoundingReferrer) {
  if (!isNative() || !configured || !code) return;
  const attrs = { referralCode: code };
  if (tierKey) attrs.referralTier = tierKey;
  if (isFoundingReferrer != null) attrs.isFoundingReferrer = String(isFoundingReferrer);
  try {
    await Purchases.setAttributes(attrs);
  } catch { /* best-effort */ }
}

export const setReferralAttribute = setReferralAttributes;

export async function manageSubscription() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const url = Capacitor.getPlatform() === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  // @ts-expect-error TS2339 — App.openUrl runtime-only in @capacitor/app@8.x
  await App.openUrl({ url });
}
