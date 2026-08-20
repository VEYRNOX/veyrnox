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

export async function configurePurchases(...args) {
  return adapter().configurePurchases(...args);
}

export async function getOfferings(...args) {
  return adapter().getOfferings(...args);
}

export async function getTierOffering(...args) {
  return adapter().getTierOffering(...args);
}

export async function purchasePackage(...args) {
  return adapter().purchasePackage(...args);
}

export async function restorePurchases(...args) {
  return adapter().restorePurchases(...args);
}

export async function getCustomerInfo(...args) {
  return adapter().getCustomerInfo(...args);
}

export async function getAppUserId(...args) {
  return adapter().getAppUserId(...args);
}

export async function addCustomerInfoUpdateListener(...args) {
  return adapter().addCustomerInfoUpdateListener(...args);
}

export async function setReferralAttributes(...args) {
  return adapter().setReferralAttributes(...args);
}

export const setReferralAttribute = setReferralAttributes;

export async function manageSubscription(...args) {
  return adapter().manageSubscription(...args);
}
