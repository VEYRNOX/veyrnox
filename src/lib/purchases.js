import { Capacitor } from '@capacitor/core';
import * as revenuecat from './purchases/revenuecatPurchases.js';
import * as samsung from './purchases/samsungPurchases.js';
import * as huawei from './purchases/huaweiPurchases.js';

export {
  SAFETY_PLUS_ENTITLEMENT,
  AI_SECURITY_PROTECTION_ENTITLEMENT,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  SAFETY_PLUS_ANNUAL_PACKAGE,
  RETENTION_OFFERING_ID,
  APPLE_OFFER_IDS,
  OFFER_UNAVAILABLE,
  findOfferOption,
  appleOfferIdFor,
  findAppleDiscount,
  offerPriceInfo,
  offerUnavailable,
  getAiSecurityProtectionOfferingId,
  currentStoreFlavor,
} from './purchases/shared.js';
export { SAMSUNG_IAP_NOT_WIRED } from './purchases/samsungPurchases.js';
export { HUAWEI_IAP_NOT_WIRED } from './purchases/huaweiPurchases.js';

/**
 * @typedef {{ offerTag?: string | null }} PurchasePackageOptions
 */

function adapter() {
  if (Capacitor.getPlatform() === 'ios') return revenuecat;
  switch (import.meta.env.VITE_STORE_FLAVOR) {
    case 'samsung':
      return samsung;
    case 'huawei':
      return huawei;
    default:
      return revenuecat;
  }
}

export async function configurePurchases() {
  return adapter().configurePurchases();
}

export async function getOfferings() {
  return adapter().getOfferings();
}

export async function getTierOffering(offeringId) {
  return adapter().getTierOffering(offeringId);
}

/**
 * @param {unknown} pkg
 * @param {PurchasePackageOptions} [opts]
 */
export async function purchasePackage(pkg, opts = {}) {
  return adapter().purchasePackage(pkg, opts);
}

export async function restorePurchases() {
  return adapter().restorePurchases();
}

export async function getCustomerInfo() {
  return adapter().getCustomerInfo();
}

export async function getAppUserId() {
  return adapter().getAppUserId();
}

/**
 * @param {(customerInfo: unknown) => void} callback
 */
export async function addCustomerInfoUpdateListener(callback) {
  return adapter().addCustomerInfoUpdateListener(callback);
}

/**
 * @param {string} code
 * @param {string | null | undefined} tierKey
 * @param {boolean | null | undefined} isFoundingReferrer
 */
export async function setReferralAttributes(code, tierKey, isFoundingReferrer) {
  return adapter().setReferralAttributes(code, tierKey, isFoundingReferrer);
}

export const setReferralAttribute = setReferralAttributes;

/**
 * @param {null | undefined | unknown} [pkg]
 */
export async function manageSubscription(pkg = null) {
  if (Capacitor.getPlatform() !== 'ios' && import.meta.env.VITE_STORE_FLAVOR === 'huawei') {
    return huawei.manageSubscription(pkg);
  }
  return adapter().manageSubscription();
}
