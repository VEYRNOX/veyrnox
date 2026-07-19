// Stub for @revenuecat/purchases-capacitor — Vite DEV SERVER / E2E only.
// The real package IS installed (package.json); its JS bridge must reach every
// `vite build` output (native builds bundle their web assets via vite build),
// so vite.config.js aliases this stub ONLY for `command === 'serve'` (F-001).
// All methods in purchases.js guard with isNative() === true before use, so
// this stub is never exercised at runtime on web dev either — it exists so the
// dev server resolves the import.
// This stub must export EVERY binding purchases.js names in its import
// statement. A named import of a missing export is a hard ES module error, not
// a runtime `undefined` — it aborts the whole module graph, so the app fails to
// mount at all rather than degrading. (That is exactly what a missing LOG_LEVEL
// did after PR #1085 added `setLogLevel`: the dev server and every Playwright
// run booted to a blank page. The unit tests mock this module wholesale, so
// they stayed green and never caught it.)
//
// Keep in sync with the imports and call sites in src/lib/purchases.js.
export const LOG_LEVEL = {
  VERBOSE: 'VERBOSE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

export const Purchases = {
  configure: () => Promise.resolve(),
  setLogLevel: () => Promise.resolve(),
  getOfferings: () => Promise.resolve({ current: null }),
  purchasePackage: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  restorePurchases: () => Promise.reject(new Error('PURCHASES_NATIVE_ONLY')),
  getCustomerInfo: () => Promise.resolve({ customerInfo: null }),
  setAttributes: () => Promise.resolve(),
  addCustomerInfoUpdateListener: () => Promise.resolve(''),
  removeCustomerInfoUpdateListener: () => Promise.resolve(),
};
