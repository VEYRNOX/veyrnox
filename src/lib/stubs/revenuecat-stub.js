// Stub for @revenuecat/purchases-capacitor — Vite DEV SERVER / E2E only.
// The real package IS installed (package.json); its JS bridge must reach every
// `vite build` output (native builds bundle their web assets via vite build),
// so vite.config.js aliases this stub ONLY for `command === 'serve'` (F-001).
// All methods in purchases.js guard with isNative() === true before use, so
// this stub is never exercised at runtime on web dev either — it exists so the
// dev server resolves the import.
export const LOG_LEVEL = {
  VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR',
};

export const Purchases = {
  setLogLevel: () => Promise.resolve(),
  configure: () => Promise.resolve(),
  getOfferings: () => Promise.resolve({ current: null }),
  purchasePackage: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  purchaseSubscriptionOption: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  purchaseDiscountedPackage: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  getPromotionalOffer: () => Promise.resolve(undefined),
  restorePurchases: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  getCustomerInfo: () => Promise.resolve({ customerInfo: null }),
  addCustomerInfoUpdateListener: () => Promise.resolve(''),
  removeCustomerInfoUpdateListener: () => Promise.resolve(),
  setAttributes: () => Promise.resolve(),
};
