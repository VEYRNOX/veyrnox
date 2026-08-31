import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import {
  findOfferOption,
  offerUnavailable,
} from './shared.js';

export const SAMSUNG_IAP_NOT_WIRED = 'SAMSUNG_IAP_NOT_WIRED';

function samsungUnsupported() {
  const err = /** @type {Error & { code?: string }} */ (
    new Error('Samsung IAP is unavailable in this build')
  );
  err.code = SAMSUNG_IAP_NOT_WIRED;
  return err;
}

function isNative() {
  return Capacitor.isNativePlatform() === true;
}

let samsungPlugin;
function plugin() {
  if (!samsungPlugin) samsungPlugin = registerPlugin('SamsungIap');
  return samsungPlugin;
}

let configured = false;

async function getStatus() {
  if (!isNative()) return { available: false, reason: 'WEB' };
  try {
    return await plugin().getStatus();
  } catch {
    return { available: false, reason: 'PLUGIN_MISSING' };
  }
}

export async function configurePurchases() {
  if (!isNative()) return;
  if (configured) return;
  const apiKey = import.meta.env.VITE_REVENUECAT_SAMSUNG_API_KEY;
  if (!apiKey) throw new Error('REVENUECAT_API_KEY_MISSING');
  const status = await getStatus();
  if (status?.available !== true) throw samsungUnsupported();
  await plugin().configure({
    apiKey,
    billingMode: import.meta.env.VITE_SAMSUNG_BILLING_MODE || (import.meta.env.PROD ? 'PRODUCTION' : 'TEST'),
  });
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
    const option = findOfferOption(pkg, offerTag);
    if (!option) throw offerUnavailable(offerTag);
    throw offerUnavailable(offerTag);
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
  const listenerId = await plugin().addCustomerInfoUpdateListener(callback);
  return () => plugin().removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
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
  // @ts-expect-error TS2339 — App.openUrl runtime-only in @capacitor/app@8.x
  await App.openUrl({ url: 'https://galaxystore.samsung.com/mypage/subscriptions' });
}
