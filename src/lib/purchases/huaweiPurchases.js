import { Capacitor, registerPlugin } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import {
  AI_SECURITY_PROTECTION_ENTITLEMENT,
  SAFETY_PLUS_ANNUAL_PACKAGE,
  SAFETY_PLUS_ENTITLEMENT,
  SAFETY_PLUS_MONTHLY_PACKAGE,
  RETENTION_OFFERING_ID,
  findOfferOption,
  getAiSecurityProtectionOfferingId,
  offerUnavailable,
} from './shared.js';

export const HUAWEI_IAP_NOT_WIRED = 'HUAWEI_IAP_NOT_WIRED';

const SUBSCRIPTION_PRICE_TYPE = 2;
const DEFAULT_OFFERING_ID = 'default';

const SAFETY_PLUS_PRODUCTS = {
  [SAFETY_PLUS_MONTHLY_PACKAGE]: import.meta.env.VITE_HUAWEI_SAFETY_PLUS_MONTHLY_PRODUCT_ID || 'safety_plus_monthly',
  [SAFETY_PLUS_ANNUAL_PACKAGE]: import.meta.env.VITE_HUAWEI_SAFETY_PLUS_ANNUAL_PRODUCT_ID || 'safety_plus_annual',
};

const AI_PRODUCTS = {
  [SAFETY_PLUS_MONTHLY_PACKAGE]: import.meta.env.VITE_HUAWEI_AI_SECURITY_PROTECTION_MONTHLY_PRODUCT_ID || 'ai_security_protection_monthly',
  [SAFETY_PLUS_ANNUAL_PACKAGE]: import.meta.env.VITE_HUAWEI_AI_SECURITY_PROTECTION_ANNUAL_PRODUCT_ID || 'ai_security_protection_annual',
};

function huaweiUnsupported() {
  const err = /** @type {Error & { code?: string }} */ (
    new Error('Huawei IAP is unavailable in this build')
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

let configured = false;

async function getStatus() {
  if (!isNative()) return { available: false, reason: 'WEB' };
  try {
    return await plugin().getStatus();
  } catch {
    return { available: false, reason: 'PLUGIN_MISSING' };
  }
}

function packageForProduct(productId) {
  for (const [pkgId, knownProductId] of Object.entries(SAFETY_PLUS_PRODUCTS)) {
    if (knownProductId === productId) return pkgId;
  }
  for (const [pkgId, knownProductId] of Object.entries(AI_PRODUCTS)) {
    if (knownProductId === productId) return pkgId;
  }
  return null;
}

function buildProduct(product) {
  const price = Number(product?.microsPrice);
  return {
    identifier: product?.productId ?? null,
    productIdentifier: product?.productId ?? null,
    id: product?.productId ?? null,
    title: product?.productName ?? null,
    description: product?.productDesc ?? null,
    priceString: product?.price ?? null,
    price: Number.isFinite(price) ? price / 1_000_000 : null,
    currencyCode: product?.currency ?? null,
    subscriptionOptions: null,
    discounts: null,
  };
}

function buildPackage(identifier, product) {
  return {
    identifier,
    packageType: identifier,
    product: buildProduct(product),
  };
}

function buildOffering(identifier, productMap) {
  const availablePackages = [];
  for (const [pkgId, productId] of Object.entries(productMap)) {
    const product = productMapByIdCache.get(productId);
    if (product) availablePackages.push(buildPackage(pkgId, product));
  }
  return {
    identifier,
    serverDescription: null,
    availablePackages,
  };
}

function entitlementsFromActive(active = {}) {
  const normalized = {};
  if (active?.[SAFETY_PLUS_ENTITLEMENT]) {
    normalized[SAFETY_PLUS_ENTITLEMENT] = {
      ...active[SAFETY_PLUS_ENTITLEMENT],
      identifier: SAFETY_PLUS_ENTITLEMENT,
      isActive: active[SAFETY_PLUS_ENTITLEMENT]?.isActive === true,
    };
  }
  if (active?.[AI_SECURITY_PROTECTION_ENTITLEMENT]) {
    normalized[AI_SECURITY_PROTECTION_ENTITLEMENT] = {
      ...active[AI_SECURITY_PROTECTION_ENTITLEMENT],
      identifier: AI_SECURITY_PROTECTION_ENTITLEMENT,
      isActive: active[AI_SECURITY_PROTECTION_ENTITLEMENT]?.isActive === true,
    };
  }
  return normalized;
}

function normalizeCustomerInfo(customerInfo) {
  return {
    ...customerInfo,
    entitlements: {
      active: entitlementsFromActive(customerInfo?.entitlements?.active ?? {}),
    },
  };
}

let productMapByIdCache = new Map();

async function fetchProductsById(productIds) {
  if (!productIds.length) return new Map();
  const { products = [] } = await plugin().getProducts({
    productIds,
    priceType: SUBSCRIPTION_PRICE_TYPE,
  });
  const map = new Map();
  for (const product of products) {
    if (product?.productId) map.set(product.productId, product);
  }
  productMapByIdCache = map;
  return map;
}

async function fetchCurrentOffering() {
  const productIds = Object.values(SAFETY_PLUS_PRODUCTS);
  const map = await fetchProductsById(productIds);
  productMapByIdCache = map;
  return buildOffering(DEFAULT_OFFERING_ID, SAFETY_PLUS_PRODUCTS);
}

async function fetchAiOffering() {
  const productIds = Object.values(AI_PRODUCTS);
  const map = await fetchProductsById(productIds);
  productMapByIdCache = map;
  return buildOffering(getAiSecurityProtectionOfferingId(), AI_PRODUCTS);
}

function productIdFromPackage(pkg) {
  const packageProductId = pkg?.identifier
    ? (SAFETY_PLUS_PRODUCTS[pkg.identifier] ?? AI_PRODUCTS[pkg.identifier] ?? null)
    : null;
  return (
    pkg?.product?.identifier ??
    pkg?.product?.productIdentifier ??
    pkg?.product?.id ??
    packageProductId ??
    null
  );
}

export async function configurePurchases() {
  if (!isNative()) return;
  if (configured) return;
  const status = await getStatus();
  if (status?.available !== true) throw huaweiUnsupported();
  if (typeof plugin().configure === 'function') {
    await plugin().configure();
  }
  configured = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  if (isDeniabilityOrDemoActive()) return null;
  return fetchCurrentOffering();
}

export async function getTierOffering(offeringId) {
  if (!isNative() || !offeringId) return null;
  if (isDeniabilityOrDemoActive()) return null;
  if (offeringId === DEFAULT_OFFERING_ID) return fetchCurrentOffering();
  if (offeringId === getAiSecurityProtectionOfferingId()) return fetchAiOffering();
  if (offeringId === RETENTION_OFFERING_ID) return null;
  return null;
}

export async function purchasePackage(pkg, opts = {}) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const offerTag = opts?.offerTag;
  if (offerTag) {
    const option = findOfferOption(pkg, offerTag);
    if (!option) throw offerUnavailable(offerTag);
    throw offerUnavailable(offerTag);
  }
  const productId = productIdFromPackage(pkg);
  if (!productId) throw new Error('HUAWEI_PRODUCT_ID_MISSING');
  const { customerInfo } = await plugin().purchaseSubscription({
    productId,
    priceType: SUBSCRIPTION_PRICE_TYPE,
  });
  return normalizeCustomerInfo(customerInfo ?? null);
}

export async function restorePurchases() {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const { customerInfo } = await plugin().restorePurchases({
    priceType: SUBSCRIPTION_PRICE_TYPE,
  });
  return normalizeCustomerInfo(customerInfo ?? null);
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { customerInfo } = await plugin().getCustomerInfo({
    priceType: SUBSCRIPTION_PRICE_TYPE,
  });
  return normalizeCustomerInfo(customerInfo ?? null);
}

export async function getAppUserId() {
  return null;
}

export async function addCustomerInfoUpdateListener(callback) {
  if (!isNative()) return () => {};
  const listenerId = await plugin().addCustomerInfoUpdateListener((payload) => {
    const customerInfo = payload?.customerInfo ?? payload;
    callback(normalizeCustomerInfo(customerInfo ?? null));
  });
  return () => plugin().removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
}

export async function setReferralAttributes() {}
export const setReferralAttribute = setReferralAttributes;

/**
 * @param {unknown} [pkg]
 */
export async function manageSubscription(pkg = null) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
  const productId = pkg ? productIdFromPackage(pkg) : null;
  await plugin().manageSubscriptions({
    productId,
  });
}

export { packageForProduct };
