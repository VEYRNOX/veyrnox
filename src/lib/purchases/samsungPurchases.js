import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

export const SAMSUNG_IAP_NOT_WIRED = 'SAMSUNG_IAP_NOT_WIRED';

function samsungUnsupported() {
  const err = /** @type {Error & { code?: string }} */ (
    new Error('Samsung IAP is not wired in this build yet')
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
  const status = await getStatus();
  if (status?.available === true) return;
  throw samsungUnsupported();
}

export async function getOfferings() { return null; }
export async function getTierOffering() { return null; }

export async function purchasePackage() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  throw samsungUnsupported();
}

export async function restorePurchases() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  throw samsungUnsupported();
}

export async function getCustomerInfo() { return null; }
export async function getAppUserId() { return null; }
export async function addCustomerInfoUpdateListener() { return () => {}; }
export async function setReferralAttributes() {}
export const setReferralAttribute = setReferralAttributes;

export async function manageSubscription() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  // @ts-expect-error TS2339 — App.openUrl runtime-only in @capacitor/app@8.x
  await App.openUrl({ url: 'https://galaxystore.samsung.com/mypage/subscriptions' });
}
