import { Capacitor, registerPlugin } from '@capacitor/core';

export const HUAWEI_IAP_NOT_WIRED = 'HUAWEI_IAP_NOT_WIRED';

function huaweiUnsupported() {
  const err = /** @type {Error & { code?: string }} */ (
    new Error('Huawei IAP is not wired in this build yet')
  );
  err.code = HUAWEI_IAP_NOT_WIRED;
  return err;
}

function isNative() {
  return Capacitor.isNativePlatform() === true;
}

let huaweiPlugin;
function plugin() {
  if (!huaweiPlugin) huaweiPlugin = registerPlugin('HuaweiIap');
  return huaweiPlugin;
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
  throw huaweiUnsupported();
}

export async function getOfferings() { return null; }
export async function getTierOffering() { return null; }

export async function purchasePackage() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  throw huaweiUnsupported();
}

export async function restorePurchases() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  throw huaweiUnsupported();
}

export async function getCustomerInfo() { return null; }
export async function getAppUserId() { return null; }
export async function addCustomerInfoUpdateListener() { return () => {}; }
export async function setReferralAttributes() {}
export const setReferralAttribute = setReferralAttributes;

export async function manageSubscription() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  throw huaweiUnsupported();
}
