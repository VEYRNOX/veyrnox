# Real Apple/Google In-App Subscription (Safety Plus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional Safety Plus subscription preview (`src/lib/tier.js`'s hard-coded `'free'` stub) with a real, receipt-verified Apple/Google in-app subscription, and actually gate the 16 Safety Plus features behind it.

**Architecture:** RevenueCat's Capacitor SDK (`@revenuecat/purchases-capacitor`) wraps StoreKit2 (iOS) and Google Play Billing (Android) and is the source of truth for entitlement — the client never self-reports its tier. Web has no App Store/Play Store, so web keeps the existing disabled preview and always resolves `'free'` (this matches the project's existing "web is testing only" convention — no new web billing surface is built). Route-level gating reuses the existing `FeatureGate.jsx` mechanism that already gates `'disabled'`/`'cut'` routes, adding a third check for Safety-Plus-only routes.

**Tech Stack:** React 18, react-router-dom v7, Capacitor 8, Vitest 4 (jsdom, `pool: forks`, `maxWorkers: 1` — see `vitest.config.js`), `@revenuecat/purchases-capacitor`, `sonner` (toasts, already a dependency).

## Global Constraints

- Entitlement identifier: exactly `safety_plus` (must match the RevenueCat dashboard entitlement id byte-for-byte — this is the string the code checks).
- Subscription product identifier: exactly `safety_plus_monthly` (must be configured as the product ID in BOTH App Store Connect and Google Play Console).
- RevenueCat offering identifier: `default`; package identifier: `$rc_monthly` (RevenueCat's standard monthly-package identifier).
- Displayed price must come from the store via `product.priceString` — never hard-code `"$5.99/mo"` in a code path that can actually purchase (Apple/Google require the real, localized store price; the existing hard-coded `$5.99/mo` stays only in `tier.js`'s display-only catalogue).
- Fail-closed (I4): any entitlement-resolution error, timeout, or missing data must resolve to `'free'` — a paid tier is only ever returned when RevenueCat positively confirms an active entitlement.
- Web is out of scope for purchasing (matches existing "web is testing only" convention — see git history `ca904e5b`). Web always resolves `'free'` without calling into the RevenueCat SDK at all.
- Secrets/keys go in `.env.local` (git-ignored), never inline shell vars — Windows/PowerShell compatibility (per CLAUDE.md). RevenueCat's public SDK API keys are client-exposed, NOT secrets (same class as the existing `VITE_WALLETCONNECT_PROJECT_ID` / `VITE_CRYPTOCOMPARE_API_KEY` pattern in `.env.example`).
- No file under `src/wallet-core/**` is touched by this feature — this is a pure UI/entitlement feature, not a seed/key/signing change.
- Test runner is Vitest; new test files live in `src/**/__tests__/*.test.{js,jsx}` (matches `vitest.config.js:37` and the existing `src/lib/__tests__/tier.test.js`).
- Until a real sandbox/license-tester purchase completes on a physical device, this feature is **BUILT, unit-tested only** — not "verified" (per this repo's verify-don't-assert rule). Task 15 is the device-verification checklist that would change that status.

---

## Phase A — External account setup (no code; do this first, in order)

These three tasks configure Apple/Google/RevenueCat to use the exact identifiers the code in Phase B references. No plan task in Phase B can be meaningfully tested end-to-end (past unit tests with mocks) until these exist, but the code itself can be written and unit-tested in parallel.

### Task 1: App Store Connect — create the Safety Plus subscription product

**Files:** none (App Store Connect dashboard only).

- [ ] **Step 1:** In [App Store Connect](https://appstoreconnect.apple.com), open the Veyrnox app record (create it first if it doesn't exist yet, using bundle id `com.veyrnox.app` — matches `capacitor.config.ts:4`).
- [ ] **Step 2:** Under **Features → In-App Purchases and Subscriptions**, create a new **Subscription Group** named `Safety Plus`.
- [ ] **Step 3:** Inside that group, create one auto-renewable subscription:
  - Product ID: `safety_plus_monthly` (must match exactly — this is a hard-coded constant in the code, see Global Constraints).
  - Reference name: `Safety Plus Monthly`.
  - Duration: 1 month.
  - Price: $5.99 USD (Apple auto-generates the localized price tiers for other storefronts).
  - Add at least one localization (English) with a display name (`Safety Plus`) and description (use the `tagline` from `src/lib/tier.js:36`: "Pre-sign intelligence and advanced analytics — harden your wallet day to day.").
- [ ] **Step 4:** Submit the subscription for review readiness (it can stay in "Ready to Submit" / "Missing Metadata" state during development — it does not need to be live to work in sandbox testing).
- [ ] **Step 5:** Note the **Shared Secret** is NOT needed for this integration (RevenueCat handles server-to-server receipt validation using its own App Store Connect API key, configured in Task 3) — do not put an Apple shared secret anywhere in this repo.

### Task 2: Google Play Console — create the Safety Plus subscription product

**Files:** none (Google Play Console dashboard only).

- [ ] **Step 1:** In [Google Play Console](https://play.google.com/console), open the Veyrnox app (package name matches `capacitor.config.ts:4`'s `com.veyrnox.app`, create the app listing first if it doesn't exist).
- [ ] **Step 2:** Under **Monetize → Products → Subscriptions**, create a new subscription:
  - Product ID: `safety_plus_monthly` (must match exactly, same identifier as Task 1).
  - Name: `Safety Plus Monthly`.
- [ ] **Step 3:** Add a **Base plan**: auto-renewing, billing period 1 month, price $5.99 USD (Google auto-generates other-currency prices, or set them manually to match Apple's tiers).
- [ ] **Step 4:** Activate the base plan (can stay in internal/closed testing track during development).
- [ ] **Step 5:** Under **Setup → API access**, link the Play Console project to a Google Cloud project and grant RevenueCat's service account access (RevenueCat's dashboard, configured in Task 3, will give you the exact service-account email and required permissions — **Financial data**, **Manage orders and subscriptions**).

### Task 3: RevenueCat dashboard — project, entitlement, offering, API keys

**Files:** `.env.local` (git-ignored — created in this task, not committed).

- [ ] **Step 1:** Create a free [RevenueCat](https://app.revenuecat.com) account and a new project named `Veyrnox`.
- [ ] **Step 2:** Add two Apps under the project:
  - iOS app: bundle id `com.veyrnox.app`, upload the App Store Connect API key (RevenueCat's setup wizard walks through generating this in App Store Connect → Users and Access → Integrations → App Store Connect API).
  - Android app: package name `com.veyrnox.app`, upload the Google Play service-account JSON key (generated per Task 2 Step 5).
- [ ] **Step 3:** Create one **Entitlement**: identifier `safety_plus` (must match exactly — this is a hard-coded constant, see Global Constraints), attach both stores' `safety_plus_monthly` product to it.
- [ ] **Step 4:** Create one **Offering**: identifier `default`, marked as the current offering, containing one **Package**: identifier `$rc_monthly`, pointing at the `safety_plus_monthly` product on both stores.
- [ ] **Step 5:** Under **Project Settings → API keys**, copy the two **Public** app-specific API keys (iOS and Android — NOT the secret/server key). Add them to `.env.local` (create the file if it doesn't exist yet by copying `.env.example`):

```
VITE_REVENUECAT_APPLE_API_KEY=<paste iOS public API key>
VITE_REVENUECAT_GOOGLE_API_KEY=<paste Android public API key>
```

- [ ] **Step 6:** Add the same two variable names (with empty values) to the committed `.env.example` template, matching the existing style at `.env.example:51-61`:

```
# --- RevenueCat (in-app subscription) — client-exposed, NOT secret ---
# Public per-platform SDK keys from app.revenuecat.com → Project Settings → API keys.
# These are safe to ship in the client bundle (RevenueCat's own docs treat them as
# public); the SECRET/server key must never appear here or anywhere in this repo.
# Native-only — web has no App Store/Play Store, so web ignores these entirely.
VITE_REVENUECAT_APPLE_API_KEY=
VITE_REVENUECAT_GOOGLE_API_KEY=
```

- [ ] **Step 7:** Commit only the `.env.example` addition (never `.env.local`):

```bash
git add .env.example
git commit -m "docs(env): add RevenueCat public API key placeholders"
```

---

## Phase B — Code (SDK, entitlement resolution, gating, purchase UI)

### Task 4: Install the RevenueCat Capacitor plugin

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (generated by npm)

**Interfaces:**
- Produces: the `@revenuecat/purchases-capacitor` package available to import in Tasks 5+.

- [ ] **Step 1:** Install the plugin:

```bash
npm install @revenuecat/purchases-capacitor@latest
```

- [ ] **Step 2:** Sync native projects so the plugin's native code is linked in (this also updates Android's Gradle files with the Play Billing dependency automatically — verified in Task 14):

```bash
npm run cap:sync
```

- [ ] **Step 3:** Confirm the install succeeded and check the installed package's exact TypeScript API surface (the wrapper in Task 5 must match this file's real exported names, not a guess):

```bash
node -e "console.log(require('@revenuecat/purchases-capacitor/package.json').version)"
```

Then open `node_modules/@revenuecat/purchases-capacitor/dist/esm/definitions.d.ts` and confirm it exports a `Purchases` object (or similarly named plugin binding) with methods named `configure`, `getOfferings`, `purchasePackage`, `restorePurchases`, `getCustomerInfo`, and `addCustomerInfoUpdateListener` (or `addListener('customerInfoUpdated', ...)` depending on version). If any name differs from what Task 5 uses below, adjust Task 5's code to the real names before proceeding — do not guess further.

- [ ] **Step 4:** Commit:

```bash
git add package.json package-lock.json
git commit -m "feat(iap): add RevenueCat Capacitor plugin dependency"
```

### Task 5: `src/lib/purchases.js` — native RevenueCat wrapper

**Files:**
- Create: `src/lib/purchases.js`
- Test: `src/lib/__tests__/purchases.test.js`

**Interfaces:**
- Consumes: `@capacitor/core`'s `Capacitor.isNativePlatform()` / `Capacitor.getPlatform()`; `@revenuecat/purchases-capacitor`'s `Purchases` object (confirmed in Task 4: `addCustomerInfoUpdateListener` returns `Promise<PurchasesCallbackId>`, a string, and is unsubscribed via the separate `Purchases.removeCustomerInfoUpdateListener({ listenerToRemove })` — there is no synchronous handle with `.remove()`).
- Produces: `SAFETY_PLUS_ENTITLEMENT` (string constant `'safety_plus'`), `configurePurchases()`, `getOfferings()`, `purchasePackage(pkg)`, `restorePurchases()`, `getCustomerInfo()`, `addCustomerInfoUpdateListener(callback) -> Promise<unsubscribeFn>` (async — registration itself is async, so the caller must await the wrapper before it has an unsubscribe function to call) — all `async`, all safe no-ops on web (used by Task 6/7/9).

- [ ] **Step 1: Write the failing test**

```javascript
// src/lib/__tests__/purchases.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

const configure = vi.fn();
const getOfferingsMock = vi.fn();
const purchasePackageMock = vi.fn();
const restorePurchasesMock = vi.fn();
const getCustomerInfoMock = vi.fn();
const addCustomerInfoUpdateListenerMock = vi.fn();
const removeCustomerInfoUpdateListenerMock = vi.fn();
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure,
    getOfferings: getOfferingsMock,
    purchasePackage: purchasePackageMock,
    restorePurchases: restorePurchasesMock,
    getCustomerInfo: getCustomerInfoMock,
    addCustomerInfoUpdateListener: addCustomerInfoUpdateListenerMock,
    removeCustomerInfoUpdateListener: removeCustomerInfoUpdateListenerMock,
  },
}));

const {
  SAFETY_PLUS_ENTITLEMENT,
  configurePurchases,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  addCustomerInfoUpdateListener,
} = await import('../purchases');

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(false);
  getPlatform.mockReturnValue('web');
});

describe('purchases.js — web (no App Store / Play Store)', () => {
  it('getOfferings resolves null without calling the plugin', async () => {
    expect(await getOfferings()).toBeNull();
    expect(getOfferingsMock).not.toHaveBeenCalled();
  });

  it('getCustomerInfo resolves null without calling the plugin', async () => {
    expect(await getCustomerInfo()).toBeNull();
    expect(getCustomerInfoMock).not.toHaveBeenCalled();
  });

  it('purchasePackage throws PURCHASES_NATIVE_ONLY', async () => {
    await expect(purchasePackage({})).rejects.toThrow('PURCHASES_NATIVE_ONLY');
  });

  it('restorePurchases throws PURCHASES_NATIVE_ONLY', async () => {
    await expect(restorePurchases()).rejects.toThrow('PURCHASES_NATIVE_ONLY');
  });

  it('addCustomerInfoUpdateListener resolves a no-op unsubscribe', async () => {
    const unsubscribe = await addCustomerInfoUpdateListener(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(addCustomerInfoUpdateListenerMock).not.toHaveBeenCalled();
  });
});

describe('purchases.js — native', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
  });

  it('configurePurchases calls Purchases.configure with the iOS key on iOS', async () => {
    process.env.VITE_REVENUECAT_APPLE_API_KEY_TEST_ONLY = 'ios-key';
    await configurePurchases();
    expect(configure).toHaveBeenCalledWith({ apiKey: expect.any(String) });
  });

  it('getOfferings returns the current offering from the plugin', async () => {
    getOfferingsMock.mockResolvedValue({ current: { identifier: 'default' }, all: {} });
    expect(await getOfferings()).toEqual({ identifier: 'default' });
  });

  it('purchasePackage returns customerInfo from the plugin', async () => {
    purchasePackageMock.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    const info = await purchasePackage({ identifier: '$rc_monthly' });
    expect(info).toEqual({ entitlements: { active: {} } });
    expect(purchasePackageMock).toHaveBeenCalledWith({ aPackage: { identifier: '$rc_monthly' } });
  });

  it('restorePurchases returns customerInfo from the plugin', async () => {
    restorePurchasesMock.mockResolvedValue({ customerInfo: { entitlements: { active: { safety_plus: {} } } } });
    const info = await restorePurchases();
    expect(info.entitlements.active[SAFETY_PLUS_ENTITLEMENT]).toBeDefined();
  });

  it('getCustomerInfo returns customerInfo from the plugin', async () => {
    getCustomerInfoMock.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    expect(await getCustomerInfo()).toEqual({ entitlements: { active: {} } });
  });

  it('addCustomerInfoUpdateListener registers with the plugin and resolves a real unsubscribe', async () => {
    addCustomerInfoUpdateListenerMock.mockResolvedValue('callback-id-123');
    removeCustomerInfoUpdateListenerMock.mockResolvedValue({ wasRemoved: true });
    const unsubscribe = await addCustomerInfoUpdateListener(() => {});
    expect(addCustomerInfoUpdateListenerMock).toHaveBeenCalled();
    await unsubscribe();
    expect(removeCustomerInfoUpdateListenerMock).toHaveBeenCalledWith({ listenerToRemove: 'callback-id-123' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/purchases.test.js`
Expected: FAIL — `Failed to resolve import "../purchases"` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/purchases.js
//
// Thin wrapper around the RevenueCat Capacitor plugin. Native platforms only —
// Apple/Google in-app purchase does not exist on web (web stays testing-only;
// see CLAUDE.md). Every export is a safe no-op on web so callers never need
// their own isNativePlatform() check.

import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';

export const SAFETY_PLUS_ENTITLEMENT = 'safety_plus';

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
  configured = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { current } = await Purchases.getOfferings();
  return current ?? null;
}

export async function purchasePackage(pkg) {
  if (!isNative()) throw new Error('PURCHASES_NATIVE_ONLY');
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/purchases.test.js`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/purchases.js src/lib/__tests__/purchases.test.js
git commit -m "feat(iap): add native RevenueCat purchases wrapper"
```

### Task 6: `src/lib/entitlement.js` — verified tier resolution

**Files:**
- Create: `src/lib/entitlement.js`
- Test: `src/lib/__tests__/entitlement.test.js`

**Interfaces:**
- Consumes: `Capacitor.isNativePlatform()` from `@capacitor/core`; `getCustomerInfo`, `SAFETY_PLUS_ENTITLEMENT` from `./purchases` (Task 5).
- Produces: `resolveTier()` — `async () => 'free' | 'safety_plus'`, fail-closed. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```javascript
// src/lib/__tests__/entitlement.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const getCustomerInfo = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  getCustomerInfo: () => getCustomerInfo(),
}));

const { resolveTier } = await import('../entitlement');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveTier', () => {
  it('resolves free on web without calling getCustomerInfo', async () => {
    isNativePlatform.mockReturnValue(false);
    expect(await resolveTier()).toBe('free');
    expect(getCustomerInfo).not.toHaveBeenCalled();
  });

  it('resolves safety_plus when the entitlement is active', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue({ entitlements: { active: { safety_plus: {} } } });
    expect(await resolveTier()).toBe('safety_plus');
  });

  it('resolves free when no entitlement is active', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
    expect(await resolveTier()).toBe('free');
  });

  it('fails closed to free when getCustomerInfo throws', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockRejectedValue(new Error('network error'));
    expect(await resolveTier()).toBe('free');
  });

  it('fails closed to free when customerInfo is null', async () => {
    isNativePlatform.mockReturnValue(true);
    getCustomerInfo.mockResolvedValue(null);
    expect(await resolveTier()).toBe('free');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/entitlement.test.js`
Expected: FAIL — `Failed to resolve import "../entitlement"`.

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/entitlement.js
//
// Resolves the user's REAL subscription tier from a verified RevenueCat
// customer-info record — never from anything the client can self-report.
// Web has no App Store/Play Store, so web always resolves 'free' without
// calling into purchases.js at all (web stays testing-only; see CLAUDE.md).
// Any error or missing entitlement fails closed to 'free' — a paid tier is
// only ever returned when RevenueCat confirms an ACTIVE entitlement.

import { Capacitor } from '@capacitor/core';
import { getCustomerInfo, SAFETY_PLUS_ENTITLEMENT } from './purchases';

export async function resolveTier() {
  if (!Capacitor.isNativePlatform()) return 'free';
  try {
    const customerInfo = await getCustomerInfo();
    const active = customerInfo?.entitlements?.active ?? {};
    return SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free';
  } catch {
    return 'free';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/entitlement.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entitlement.js src/lib/__tests__/entitlement.test.js
git commit -m "feat(iap): add verified, fail-closed tier resolution"
```

### Task 7: `src/lib/TierProvider.jsx` — async, live-updating tier context

**Files:**
- Modify: `src/lib/TierProvider.jsx`
- Test: `src/lib/__tests__/TierProvider.test.jsx`

**Interfaces:**
- Consumes: `resolveTier()` (Task 6), `addCustomerInfoUpdateListener` (Task 5 — `async (callback) => Promise<unsubscribeFn>`, registration is async), `SAFETY_PLUS_ENTITLEMENT` (Task 5), `TIERS` (`src/lib/tier.js`, unchanged).
- Produces: `useTier()` returns `{ currentTier, tiers, loading, refreshTier }` — `refreshTier` is `async () => 'free' | 'safety_plus'`, consumed by Task 10 (FeatureGate) and Task 12 (Subscription page).

- [ ] **Step 1: Write the failing test**

```javascript
// src/lib/__tests__/TierProvider.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const resolveTier = vi.fn();
vi.mock('../entitlement', () => ({ resolveTier: () => resolveTier() }));

let capturedListener = null;
const unsubscribe = vi.fn();
vi.mock('../purchases', () => ({
  SAFETY_PLUS_ENTITLEMENT: 'safety_plus',
  addCustomerInfoUpdateListener: async (cb) => {
    capturedListener = cb;
    return unsubscribe;
  },
}));

const { TierProvider, useTier } = await import('../TierProvider');

function Probe() {
  const { currentTier, loading, tiers } = useTier();
  return (
    <div>
      <span data-testid="tier">{currentTier}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="tier-count">{tiers.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedListener = null;
});

describe('TierProvider', () => {
  it('starts loading=true, free, then resolves to the real tier', async () => {
    resolveTier.mockResolvedValue('safety_plus');
    render(<TierProvider><Probe /></TierProvider>);
    expect(screen.getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('tier').textContent).toBe('safety_plus');
  });

  it('exposes the full tier catalogue', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(Number(screen.getByTestId('tier-count').textContent)).toBe(2);
  });

  it('updates currentTier live when the customer-info listener fires', async () => {
    resolveTier.mockResolvedValue('free');
    render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('tier').textContent).toBe('free'));
    await waitFor(() => expect(capturedListener).not.toBeNull());

    act(() => {
      capturedListener({ entitlements: { active: { safety_plus: {} } } });
    });

    expect(screen.getByTestId('tier').textContent).toBe('safety_plus');
  });

  it('unsubscribes the listener on unmount', async () => {
    resolveTier.mockResolvedValue('free');
    const { unmount } = render(<TierProvider><Probe /></TierProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    await waitFor(() => expect(capturedListener).not.toBeNull());
    unmount();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/TierProvider.test.jsx`
Expected: FAIL — the current `TierProvider` has no `loading`/`refreshTier` and `currentTier` is synchronous `'free'`, so the "live update" and "loading" assertions fail.

- [ ] **Step 3: Write the implementation**

```jsx
// lib/TierProvider.jsx
//
// Resolves and exposes the user's real subscription tier. On mount, resolves
// once from entitlement.js (native: verified RevenueCat receipt; web: always
// 'free'), then — native only — subscribes to live customer-info updates so
// a purchase, renewal, or expiry updates the tier without an app restart.
// refreshTier() lets a caller (e.g. after "Restore Purchases") force a
// re-resolve instead of waiting for the next listener event.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { resolveTier } from '@/lib/entitlement';
import { addCustomerInfoUpdateListener, SAFETY_PLUS_ENTITLEMENT } from '@/lib/purchases';
import { TIERS } from '@/lib/tier';

const TierCtx = createContext(null);

export function TierProvider({ children }) {
  const [currentTier, setCurrentTier] = useState('free');
  const [loading, setLoading] = useState(true);

  const refreshTier = useCallback(async () => {
    const tier = await resolveTier();
    setCurrentTier(tier);
    return tier;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      const tier = await resolveTier();
      if (!cancelled) {
        setCurrentTier(tier);
        setLoading(false);
      }
    })();

    (async () => {
      // Registration is async (the plugin returns a listener id to unregister
      // with later) — if the component unmounts before it resolves, unsubscribe
      // immediately instead of leaking a live listener.
      const unsub = await addCustomerInfoUpdateListener((customerInfo) => {
        const active = customerInfo?.entitlements?.active ?? {};
        setCurrentTier(SAFETY_PLUS_ENTITLEMENT in active ? 'safety_plus' : 'free');
      });
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = { currentTier, tiers: TIERS, loading, refreshTier };

  return <TierCtx.Provider value={value}>{children}</TierCtx.Provider>;
}

export function useTier() {
  const ctx = useContext(TierCtx);
  if (!ctx) throw new Error('useTier must be used within TierProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/TierProvider.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/TierProvider.jsx src/lib/__tests__/TierProvider.test.jsx
git commit -m "feat(iap): make TierProvider resolve a real, live-updating tier"
```

### Task 8: `src/lib/safetyPlusRoutes.js` — canonical gated-route list

**Files:**
- Create: `src/lib/safetyPlusRoutes.js`
- Test: `src/lib/__tests__/safetyPlusRoutes.test.js`

**Interfaces:**
- Produces: `SAFETY_PLUS_ROUTES` (array of path strings), `isSafetyPlusRoute(path) -> boolean`. Consumed by Task 10 (FeatureGate) and Task 11 (SafetyPlus.jsx route fix).

- [ ] **Step 1: Write the failing test**

```javascript
// src/lib/__tests__/safetyPlusRoutes.test.js
import { describe, it, expect } from 'vitest';
import { SAFETY_PLUS_ROUTES, isSafetyPlusRoute } from '../safetyPlusRoutes';

describe('safetyPlusRoutes', () => {
  it('lists exactly the 16 Safety Plus feature routes', () => {
    expect(SAFETY_PLUS_ROUTES).toEqual([
      '/hardware-wallet',
      '/risk',
      '/security',
      '/token-approvals',
      '/address-checker',
      '/fraud',
      '/security-dashboard',
      '/cloud-backup',
      '/spam-filter',
      '/audit-log',
      '/risk-score',
      '/advanced-analytics',
      '/onchain',
      '/price-charts',
      '/recurring',
      '/crypto-signing',
    ]);
  });

  it('isSafetyPlusRoute is true for a gated route', () => {
    expect(isSafetyPlusRoute('/hardware-wallet')).toBe(true);
  });

  it('isSafetyPlusRoute is false for a free route', () => {
    expect(isSafetyPlusRoute('/dashboard')).toBe(false);
  });

  it('isSafetyPlusRoute is false for the plans/safety-plus hub pages themselves', () => {
    expect(isSafetyPlusRoute('/plans')).toBe(false);
    expect(isSafetyPlusRoute('/safety-plus')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/safetyPlusRoutes.test.js`
Expected: FAIL — `Failed to resolve import "../safetyPlusRoutes"`.

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/safetyPlusRoutes.js
//
// Canonical list of routes that require the Safety Plus entitlement. This is
// the single source of truth FeatureGate.jsx checks against — SafetyPlus.jsx
// (the feature hub) mirrors these paths for its nav links; update this list
// first when a Safety Plus feature moves or a new one ships.

export const SAFETY_PLUS_ROUTES = [
  '/hardware-wallet',
  '/risk',
  '/security',
  '/token-approvals',
  '/address-checker',
  '/fraud',
  '/security-dashboard',
  '/cloud-backup',
  '/spam-filter',
  '/audit-log',
  '/risk-score',
  '/advanced-analytics',
  '/onchain',
  '/price-charts',
  '/recurring',
  '/crypto-signing',
];

export function isSafetyPlusRoute(path) {
  return SAFETY_PLUS_ROUTES.includes(path);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/safetyPlusRoutes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/safetyPlusRoutes.js src/lib/__tests__/safetyPlusRoutes.test.js
git commit -m "feat(iap): add canonical Safety Plus gated-route list"
```

### Task 9: `src/components/TierLockedPage.jsx` — honest paywall notice

**Files:**
- Create: `src/components/TierLockedPage.jsx`
- Test: `src/components/__tests__/TierLockedPage.test.jsx`

**Interfaces:**
- Produces: default-exported `TierLockedPage()` component, no props. Consumed by Task 10 (FeatureGate).

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/__tests__/TierLockedPage.test.jsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TierLockedPage from '../TierLockedPage';

describe('TierLockedPage', () => {
  it('explains the feature requires Safety Plus and links to /plans', () => {
    render(
      <MemoryRouter>
        <TierLockedPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Safety Plus/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /view plans/i });
    expect(link.getAttribute('href')).toBe('/plans');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/TierLockedPage.test.jsx`
Expected: FAIL — `Failed to resolve import "../TierLockedPage"`.

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/TierLockedPage.jsx
//
// Full-page honest notice for a route that requires the Safety Plus
// entitlement the current user doesn't have. Distinct from
// HonestDisabledPage.jsx (which explains a feature that's off for everyone) —
// this feature IS live, just paywalled, so the notice points at /plans instead
// of explaining an engineering limitation.
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TierLockedPage() {
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 flex items-start gap-3">
      <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">Safety Plus feature</p>
        <p className="text-muted-foreground mt-1">
          This feature is part of Safety Plus ($5.99/mo). Upgrade to unlock it.
        </p>
        <Link
          to="/plans"
          className="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/TierLockedPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TierLockedPage.jsx src/components/__tests__/TierLockedPage.test.jsx
git commit -m "feat(iap): add honest Safety Plus paywall notice"
```

### Task 10: `src/components/FeatureGate.jsx` — enforce the tier gate

**Files:**
- Modify: `src/components/FeatureGate.jsx`
- Test: `src/components/__tests__/FeatureGate.test.jsx`

**Interfaces:**
- Consumes: `featureRouteOutcome` (`src/lib/featureRegistry.js`, unchanged), `isSafetyPlusRoute` (Task 8), `useTier` (Task 7), `TierLockedPage` (Task 9), `HonestDisabledPage`/`PageNotFound` (unchanged).

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/__tests__/FeatureGate.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/featureRegistry', () => ({
  featureRouteOutcome: (path) => (path === '/cut-route' ? 'notFound' : path === '/off-route' ? 'disabled' : 'render'),
}));
vi.mock('@/lib/featureRegistry', async () => {
  const actual = {};
  return {
    ...actual,
    featureRouteOutcome: (path) =>
      path === '/cut-route' ? 'notFound' : path === '/off-route' ? 'disabled' : 'render',
  };
});
vi.mock('@/lib/safetyPlusRoutes', () => ({
  isSafetyPlusRoute: (path) => path === '/hardware-wallet',
}));

const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({ useTier: () => useTierMock() }));

const FeatureGate = (await import('../FeatureGate')).default;

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FeatureGate>
        <div data-testid="page">real page</div>
      </FeatureGate>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeatureGate — Safety Plus tier check', () => {
  it('renders the page for a non-Safety-Plus route regardless of tier', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/dashboard');
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('renders a loading state for a Safety Plus route while tier is resolving', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: true });
    renderAt('/hardware-wallet');
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('renders TierLockedPage for a Safety Plus route when the user is free', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/hardware-wallet');
    expect(screen.queryByTestId('page')).toBeNull();
    expect(screen.getByText(/Safety Plus feature/)).toBeTruthy();
  });

  it('renders the real page for a Safety Plus route when the user is subscribed', () => {
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', loading: false });
    renderAt('/hardware-wallet');
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('still returns Not Found for a cut route ahead of the tier check', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/cut-route');
    expect(screen.queryByTestId('page')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/FeatureGate.test.jsx`
Expected: FAIL — current `FeatureGate` doesn't call `useTier` or check `isSafetyPlusRoute`, so the loading/locked/unlocked cases render the page unconditionally instead.

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/FeatureGate.jsx
//
// Central route-level enforcement of the feature classification AND the
// Safety Plus subscription tier. Wraps the Layout <Outlet/> so EVERY routed
// sub-page is gated in one place: a 'cut' route renders Not Found, a
// 'disabled' route renders the honest notice, a Safety-Plus-only route
// renders a paywall notice for free users, everything else renders normally.
// Reads the current path from the router, unless an explicit `path` is
// passed (see below).
import { useLocation } from 'react-router-dom';
import { featureRouteOutcome } from '@/lib/featureRegistry';
import { isSafetyPlusRoute } from '@/lib/safetyPlusRoutes';
import { useTier } from '@/lib/TierProvider';
import HonestDisabledPage from './HonestDisabledPage';
import TierLockedPage from './TierLockedPage';
import PageNotFound from '@/lib/PageNotFound';

// `path` overrides the router location, for callers that render a specific page
// outside the routed <Outlet/> — notably the always-mounted mobile root-tab
// panels in Layout, which would otherwise bypass the gate entirely.
export default function FeatureGate({ children, path }) {
  const { pathname } = useLocation();
  const { currentTier, loading } = useTier();
  const target = path ?? pathname;

  const outcome = featureRouteOutcome(target);
  if (outcome === 'notFound') return <PageNotFound />;
  if (outcome === 'disabled') return <HonestDisabledPage path={target} />;

  if (isSafetyPlusRoute(target)) {
    if (loading) {
      return (
        <div className="max-w-md mx-auto mt-12 text-sm text-muted-foreground text-center">
          Loading…
        </div>
      );
    }
    if (currentTier !== 'safety_plus') return <TierLockedPage />;
  }

  return children;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/FeatureGate.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm test`
Expected: PASS (all prior suites, including `tier.test.js`, unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/components/FeatureGate.jsx src/components/__tests__/FeatureGate.test.jsx
git commit -m "feat(iap): enforce Safety Plus tier at the route gate"
```

### Task 11: `src/pages/SafetyPlus.jsx` — fix broken nav links, reuse canonical routes

**Files:**
- Modify: `src/pages/SafetyPlus.jsx:36-38`

**Interfaces:** none new — pure bugfix so the hub's nav links match the routes Task 8/10 actually gate.

- [ ] **Step 1: Write the failing test**

```javascript
// src/pages/__tests__/SafetyPlus.routes.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAFETY_PLUS_ROUTES } from '@/lib/safetyPlusRoutes';

describe('SafetyPlus.jsx feature routes', () => {
  it('every route listed on the hub page exists in the canonical Safety Plus route list', () => {
    const source = readFileSync(new URL('../SafetyPlus.jsx', import.meta.url), 'utf-8');
    const routeMatches = [...source.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(routeMatches.length).toBe(16);
    for (const route of routeMatches) {
      expect(SAFETY_PLUS_ROUTES, `${route} must be a real, gated route`).toContain(route);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/__tests__/SafetyPlus.routes.test.js`
Expected: FAIL — `/risk-scoring`, `/analytics`, and `/on-chain` (current lines 36-38) are not in `SAFETY_PLUS_ROUTES` (which has `/risk-score`, `/advanced-analytics`, `/onchain`).

- [ ] **Step 3: Fix the three broken routes**

In `src/pages/SafetyPlus.jsx`, change lines 36-38 from:

```javascript
      { name: "Portfolio Risk Score", summary: "Concentration, leverage and volatility scoring across your holdings", route: "/risk-scoring" },
      { name: "Advanced Analytics", summary: "Sharpe ratio, correlation matrix, volatility analysis", route: "/analytics" },
      { name: "On-Chain Analytics", summary: "Address-level transaction activity and insights", route: "/on-chain" },
```

to:

```javascript
      { name: "Portfolio Risk Score", summary: "Concentration, leverage and volatility scoring across your holdings", route: "/risk-score" },
      { name: "Advanced Analytics", summary: "Sharpe ratio, correlation matrix, volatility analysis", route: "/advanced-analytics" },
      { name: "On-Chain Analytics", summary: "Address-level transaction activity and insights", route: "/onchain" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/__tests__/SafetyPlus.routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SafetyPlus.jsx src/pages/__tests__/SafetyPlus.routes.test.js
git commit -m "fix(safety-plus): correct three feature hub links to real routes"
```

### Task 12: `src/pages/Subscription.jsx` — real purchase/restore flow

**Files:**
- Modify: `src/pages/Subscription.jsx` (full rewrite of the data/behavior; card markup largely unchanged)
- Test: `src/pages/__tests__/Subscription.test.jsx`

**Interfaces:**
- Consumes: `useTier()` (`currentTier`, `tiers`, `refreshTier` from Task 7), `getOfferings`/`purchasePackage`/`restorePurchases` (Task 5), `FREE_FEATURES`/`SAFETY_PLUS_FEATURES` (`src/lib/tier.js`, unchanged), `Capacitor.isNativePlatform()`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/pages/__tests__/Subscription.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

const getOfferings = vi.fn();
const purchasePackage = vi.fn();
const restorePurchases = vi.fn();
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  purchasePackage: (...a) => purchasePackage(...a),
  restorePurchases: (...a) => restorePurchases(...a),
}));

const refreshTier = vi.fn();
const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({ useTier: () => useTierMock() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const Subscription = (await import('../Subscription')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <Subscription />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTierMock.mockReturnValue({ currentTier: 'free', tiers: [], refreshTier });
});

describe('Subscription page — web (no store)', () => {
  it('shows the mobile-only notice and a disabled upgrade button', async () => {
    isNativePlatform.mockReturnValue(false);
    renderPage();
    expect(screen.getByText(/testing-only/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /mobile only/i })).toBeDisabled();
  });
});

describe('Subscription page — native', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
      ],
    });
  });

  it('shows the real store price once offerings load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
  });

  it('purchasing calls purchasePackage then refreshes the tier', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /upgrade to safety plus/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_monthly',
      product: { priceString: '$5.99' },
    }));
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });

  it('restoring calls restorePurchases then refreshes the tier', async () => {
    restorePurchases.mockResolvedValue({});
    refreshTier.mockResolvedValue('free');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByText(/restore purchases/i));
    await waitFor(() => expect(restorePurchases).toHaveBeenCalled());
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/__tests__/Subscription.test.jsx`
Expected: FAIL — the current page has no native/web branch, no offerings fetch, and a permanently-disabled button with no click handler.

- [ ] **Step 3: Write the implementation**

```jsx
// pages/Subscription.jsx — route /plans
//
// Native (iOS/Android): real purchase flow via RevenueCat — fetches the
// current offering, purchases the Safety Plus package, and refreshes the
// tier context on success. Web has no App Store/Play Store (web stays
// testing-only; see CLAUDE.md), so it keeps a disabled, honest preview.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Info, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { useTier } from "@/lib/TierProvider";
import { FREE_FEATURES, SAFETY_PLUS_FEATURES } from "@/lib/tier";
import { getOfferings, purchasePackage, restorePurchases } from "@/lib/purchases";

const CURRENT_BADGE = "bg-success/10 text-success border-success/20";

function FeatureList({ features }) {
  return (
    <ul className="space-y-2">
      {features.map((f) => (
        <li key={f.name} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">{f.name}</span>
            <span className="block text-xs text-muted-foreground">{f.summary}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Subscription() {
  const { currentTier, refreshTier } = useTier();
  const [plusPackage, setPlusPackage] = useState(null);
  const [busy, setBusy] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const pkg = offering?.availablePackages?.find((p) => p.identifier === "$rc_monthly")
          ?? offering?.availablePackages?.[0]
          ?? null;
        setPlusPackage(pkg);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isNative]);

  const priceString = plusPackage?.product?.priceString ?? "$5.99/mo";

  async function handleUpgrade() {
    if (!plusPackage) return;
    setBusy(true);
    try {
      await purchasePackage(plusPackage);
      await refreshTier();
      toast.success("Safety Plus unlocked");
    } catch (err) {
      if (!err?.userCancelled) toast.error("Purchase failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    try {
      await restorePurchases();
      const tier = await refreshTier();
      toast[tier === "safety_plus" ? "success" : "info"](
        tier === "safety_plus" ? "Safety Plus restored" : "No active Safety Plus purchase found"
      );
    } catch {
      toast.error("Restore failed — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <BackButton />

      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <div className="text-muted-foreground mt-1 text-sm">
          You are on the{" "}
          <Badge variant="outline" className={CURRENT_BADGE}>
            {currentTier === "safety_plus" ? "Safety Plus plan" : "Free plan"}
          </Badge>{" "}
          — the complete self-custody wallet, no account required.
        </div>
      </div>

      {!isNative && (
        <div className="flex items-start gap-3 rounded-xl border border-caution/20 bg-caution/5 p-4">
          <Info className="h-5 w-5 text-caution shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            In-app purchase via Google Play and App Store is available in the mobile app.
            This web build is testing-only — install Veyrnox on iOS or Android to upgrade.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={currentTier === "free" ? "border-primary/50" : undefined}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Free</CardTitle>
              {currentTier === "free" && (
                <Badge variant="outline" className={CURRENT_BADGE}>Current plan</Badge>
              )}
            </div>
            <p className="text-2xl font-bold mt-1">$0</p>
            <CardDescription>
              The complete self-custody wallet plus all life-safety security. No account required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureList features={FREE_FEATURES} />
          </CardContent>
        </Card>

        <Card className={currentTier === "safety_plus" ? "border-primary/50" : "border-primary/20"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Safety Plus
                <Sparkles className="h-4 w-4 text-primary" />
              </CardTitle>
              {currentTier === "safety_plus" && (
                <Badge variant="outline" className={CURRENT_BADGE}>Current plan</Badge>
              )}
            </div>
            <p className="text-2xl font-bold mt-1">{priceString}</p>
            <CardDescription>
              Everything in Free, plus pre-sign intelligence and advanced analytics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Everything in Free, plus:</p>
            <FeatureList features={SAFETY_PLUS_FEATURES} />
          </CardContent>
        </Card>
      </div>

      <Link
        to="/safety-plus"
        className="flex items-center justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 hover:border-primary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold">Explore Safety Plus features</p>
            <p className="text-xs text-muted-foreground">See every feature grouped by SECURITY · FINANCE · CONNECT</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
      </Link>

      {currentTier !== "safety_plus" && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            disabled={!isNative || !plusPackage || busy}
            className="w-full max-w-md"
            onClick={handleUpgrade}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isNative ? `Upgrade to Safety Plus — ${priceString}` : "Upgrade to Safety Plus — mobile only"}
          </Button>
          {isNative ? (
            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="text-xs text-muted-foreground underline"
            >
              Restore purchases
            </button>
          ) : (
            <p className="text-xs text-muted-foreground text-center max-w-md">
              No payment can be made on this screen. Your plan stays Free on web.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/__tests__/Subscription.test.jsx`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Subscription.jsx src/pages/__tests__/Subscription.test.jsx
git commit -m "feat(iap): wire real RevenueCat purchase/restore flow into Plans page"
```

---

## Phase C — Native platform wiring (manual; requires the real hardware/OS each platform needs)

### Task 13: iOS — enable In-App Purchase capability + StoreKit local-testing config

**Files:**
- Create: `ios/App/App/Configuration.storekit`
- Modify: Xcode project settings (not a text file this plan can diff — GUI steps below)

> This task needs a Mac with Xcode — per CLAUDE.md, iOS native builds are not possible in this (Windows) environment. Hand this task to whoever has Mac access; everything else in this plan (Phase A/B, Task 14) does not require one.

- [ ] **Step 1:** Open `ios/App/App.xcworkspace` in Xcode. Select the `App` target → **Signing & Capabilities** → **+ Capability** → add **In-App Purchase**.
- [ ] **Step 2:** Create a local StoreKit configuration file for sandbox-free local testing: File → New → File → **StoreKit Configuration File**, save as `ios/App/App/Configuration.storekit`, and add one auto-renewable subscription matching Task 1 exactly:

```json
{
  "identifier": "safety_plus_monthly",
  "referenceName": "Safety Plus Monthly",
  "productID": "safety_plus_monthly",
  "type": "RecurringSubscription",
  "subscriptionGroupID": "safety_plus_group",
  "recurringSubscriptionPeriod": "P1M",
  "displayPrice": "5.99",
  "familyShareable": false,
  "localizations": [
    {
      "locale": "en_US",
      "displayName": "Safety Plus",
      "description": "Pre-sign intelligence and advanced analytics — harden your wallet day to day."
    }
  ]
}
```

- [ ] **Step 3:** In the Xcode scheme editor (Product → Scheme → Edit Scheme → Run → Options), set **StoreKit Configuration** to `Configuration.storekit`. This lets you test purchases in the Simulator/local device without a live App Store Connect sandbox account.
- [ ] **Step 4:** Rebuild and confirm the app launches with no capability-related entitlement errors:

```bash
npm run ios
```

- [ ] **Step 5:** Commit the StoreKit config file (Xcode project/capability changes are captured in the `.pbxproj`/entitlements files Xcode edits automatically):

```bash
git add ios/App/App/Configuration.storekit ios/App/App.xcodeproj
git commit -m "feat(iap): add iOS In-App Purchase capability and local StoreKit config"
```

### Task 14: Android — verify the Play Billing dependency landed via `cap sync`

**Files:** none expected to need manual edits — this task verifies Task 4 Step 2's `cap sync` did its job; this repo's Windows environment can run this directly.

- [ ] **Step 1:** Confirm the RevenueCat/Play Billing native dependency is now present in the generated Android project:

```bash
grep -r "purchases-capacitor\|billingclient" android/app/build.gradle android/capacitor.settings.gradle
```

Expected: at least one match referencing `@revenuecat/purchases-capacitor` (Capacitor auto-generates a `:node_modules/@revenuecat/purchases-capacitor` Gradle module reference in `android/capacitor.settings.gradle` — same mechanism as every other Capacitor plugin already in this project, e.g. `@capacitor/local-notifications`).

- [ ] **Step 2:** If no match: re-run `npm run cap:sync` and check `android/capacitor.settings.gradle` again — this file is auto-generated and should never be hand-edited.
- [ ] **Step 3:** Confirm a clean Android build succeeds (this alone doesn't purchase anything, just proves the native dependency graph resolves):

```bash
npm run android:sync
```

Expected: build completes with no Gradle resolution errors for the new dependency.

- [ ] **Step 4:** No commit needed if `android/capacitor.settings.gradle` was already correct from Task 4's `cap:sync`; if Step 2's re-sync changed it, commit:

```bash
git add android/capacitor.settings.gradle
git commit -m "chore(iap): sync Android Gradle for RevenueCat plugin"
```

---

## Phase D — Device verification (this is what would move the status from BUILT to verified)

### Task 15: Real sandbox purchase, restore, and expiry checklist

**Files:** none — this is a manual verification checklist, not a code task. Do not mark this feature "verified" anywhere in docs until every item below has actually happened on a real device, per this repo's verify-don't-assert rule.

- [ ] **Step 1 (iOS):** On a physical iPhone (or Simulator with the StoreKit config from Task 13) signed into a **Sandbox Apple ID** (App Store Connect → Users and Access → Sandbox Testers), open the app, go to `/plans`, tap **Upgrade to Safety Plus**, confirm the sandbox purchase sheet, complete it. Confirm: `currentTier` becomes `safety_plus` without an app restart, a previously-locked route (e.g. `/hardware-wallet`) now renders instead of `TierLockedPage`.
- [ ] **Step 2 (iOS):** Force-quit and relaunch the app. Confirm the tier is still `safety_plus` on cold start (i.e. `resolveTier()` correctly reads the persisted RevenueCat entitlement, not just the live listener event from Step 1).
- [ ] **Step 3 (iOS):** In App Store Connect sandbox, cancel/expire the sandbox subscription (or wait for its accelerated sandbox renewal cycle to lapse). Confirm the app's tier reverts to `free` and the gated routes lock again — either via the live listener or on next app foreground.
- [ ] **Step 4 (iOS):** Delete and reinstall the app under the same sandbox Apple ID, then tap **Restore purchases** on `/plans`. Confirm it recovers the `safety_plus` entitlement without a new purchase sheet.
- [ ] **Step 5 (Android):** On a physical Android device, add the tester account as a **License Tester** in Play Console (Setup → License testing), install the app from an internal-testing-track build, repeat Steps 1-4 using a real (test-card, zero-charge) Play Store purchase instead of StoreKit.
- [ ] **Step 6:** Record the outcome (device model, OS version, pass/fail per step, any error codes seen) in `docs/Feature-Status.md` under a new Safety Plus IAP entry, using this repo's BUILT / device-verified language exactly as used for the hardware-KEK features — do not write "verified" unless every step above passed on a real device with no workaround.

---

## Self-Review

**Spec coverage:**
- RevenueCat SDK install + native wrapper → Task 4, 5.
- Verified, fail-closed entitlement resolution (never client-forged) → Task 6.
- Async, live-updating tier context → Task 7.
- Gating the 16 Safety Plus features → Task 8 (route list), 9 (paywall UI), 10 (enforcement), 11 (fixes 3 pre-existing broken nav links so the gate and the hub agree).
- Real purchase/restore UI, real store-localized pricing → Task 12.
- iOS/Android native platform requirements → Task 13, 14.
- App Store Connect / Google Play Console / RevenueCat dashboard setup → Task 1, 2, 3.
- Device verification bar (this repo's verify-don't-assert culture) → Task 15.
- No placeholder pricing, no client-forgeable tier, no wallet-core touch, web excluded from purchasing → covered in Global Constraints and enforced throughout (e.g. `priceString` from the store, `resolveTier()` fail-closed).

**Placeholder scan:** No TBD/"add error handling"/"similar to Task N" strings — every step has complete code or a fully concrete manual step with real identifiers.

**Type consistency:** `resolveTier()` (Task 6) is consumed identically in Task 7 (`useEffect` + `refreshTier`); `useTier()`'s returned shape (`currentTier`, `tiers`, `loading`, `refreshTier`) is used consistently in Task 10 (`currentTier`, `loading`) and Task 12 (`currentTier`, `refreshTier`); `SAFETY_PLUS_ENTITLEMENT` and `isSafetyPlusRoute`/`SAFETY_PLUS_ROUTES` naming is consistent across Tasks 5, 6, 8, 10, 11.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
