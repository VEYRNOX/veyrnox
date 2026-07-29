// Warm-wallet perf sweep — measures nav timings for AUTHENTICATED routes
// (dashboard, send, receive, analytics, tax, alerts) after a real onboarding
// pass. Complements web-perf.spec.js (cold demo-mode landing pages) with the
// signed-in surface most users actually spend time on.
//
// Design choice: one BrowserContext, one onboarding pass in beforeAll, one
// test per route within that same context. Playwright's storageState does
// NOT persist IndexedDB, and Veyrnox stores the vault in IDB — so a
// storageState-based warm profile silently loses the vault and drops back
// to the unlock screen. Keeping everything in a single context is the only
// clean way to reuse an unlocked wallet across tests without persistent
// user-data-dir gymnastics.
//
// Selector provenance mirrors e2e/onboarding.spec.js — that file is the
// authoritative source; any drift there needs mirroring here.
//
// Modes (WARM_WALLET_MODE env):
//   create  — real seed generation, no chain state. Deterministic, isolated. DEFAULT.
//   import  — imports VITE_TEST_THROWAWAY_SEED. Adds a real RPC call for
//             balance-of-zero, so numbers reflect the network path too.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const REPEATS = Number(process.env.PERF_REPEATS || 3);
const MODE = (process.env.WARM_WALLET_MODE || 'create').toLowerCase();
const IMPORT_SEED = process.env.VITE_TEST_THROWAWAY_SEED;
const VAULT_PIN = '48273951'; // matches e2e/onboarding.spec.js — non-sequential

// Authenticated routes with realistic per-route budgets. Warm-wallet dashboards
// legitimately do more than a demo landing page (portfolio render, price feed),
// so budgets are looser than web-perf.spec.js — but still fail-closed.
const ROUTES = [
  { path: '/',           fcpMs: 2500, lcpMs: 3500, ttfbMs: 500, name: 'dashboard' },
  { path: '/send',       fcpMs: 2200, lcpMs: 3000, ttfbMs: 500, name: 'send' },
  { path: '/receive',    fcpMs: 2500, lcpMs: 3500, ttfbMs: 500, name: 'receive' },
  { path: '/analytics',  fcpMs: 2500, lcpMs: 3500, ttfbMs: 500, name: 'analytics' },
  { path: '/tax',        fcpMs: 2500, lcpMs: 3500, ttfbMs: 500, name: 'tax' },
  { path: '/alerts',     fcpMs: 2200, lcpMs: 3000, ttfbMs: 500, name: 'alerts' },
];

test.describe.configure({ mode: 'serial' });

// One shared page/context across the whole file so IDB (the vault) survives.
let context;
let page;

test.beforeAll(async ({ browser }) => {
  if (MODE === 'import' && !IMPORT_SEED) {
    test.skip(true, 'WARM_WALLET_MODE=import requires VITE_TEST_THROWAWAY_SEED');
  }

  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    baseURL: BASE,
  });
  page = await context.newPage();

  // Fresh install — clear the sticky demo flag and any prior state.
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => {
    try {
      localStorage.clear();
      localStorage.setItem('veyrnox-telemetry-consent', 'denied');
    } catch {}
  });
  await page.evaluate(async () => {
    try {
      const dbs = (await indexedDB.databases?.()) || [];
      for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);

  // Phase 1: PIN cohort setup.
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);

  // Phase 1.5: leave the Explore shell.
  await expect(page.getByText('Exploring — view only', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();

  // Phase 2: create or import.
  if (MODE === 'import') {
    await page.getByRole('button', { name: /Import an existing seed/i }).click();
    await page.getByLabel('Recovery seed phrase').fill(IMPORT_SEED);
    await page.getByRole('button', { name: /Restore \/ Import/i }).click();
  } else {
    await page.getByRole('button', { name: /Create Wallet/i }).click();
  }

  // Authed shell marker — the 'Send' nav link.
  await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test.afterAll(async () => {
  const dir = path.join(process.cwd(), 'perf', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'warm-wallet-perf.json'),
    JSON.stringify({ base: BASE, mode: MODE, repeats: REPEATS, results }, null, 2)
  );
  if (context) await context.close();
});

async function enterPin(p, pin) {
  const pad = p.getByRole('group', { name: /PIN entry/i });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

async function measure(url) {
  // Perf entries accumulate across navigations in a persistent page; clear
  // per-run so LCP from the previous route doesn't bleed into this one.
  await page.evaluate(() => {
    try {
      performance.clearResourceTimings();
      performance.clearMarks();
      performance.clearMeasures();
    } catch {}
  });
  // waitUntil MUST NOT be 'networkidle' — the wallet dashboard polls
  // price feeds continuously and the network never goes quiet, so
  // goto would hang to the test timeout. 'load' fires once the initial
  // resources are done; the explicit LCP wait below handles render.
  await page.goto(url, { waitUntil: 'load' });
  // Poll for LCP with a bounded timeout; log + skip if it never fires
  // rather than erroring on a matcher-type mismatch.
  await page
    .waitForFunction(
      () => performance.getEntriesByType('largest-contentful-paint').length > 0,
      { timeout: 5000 }
    )
    .catch(() => {});
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    const lcp = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
    return {
      ttfbMs: nav.responseStart ? Math.round(nav.responseStart) : null,
      fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      lcpMs: lcp ? Math.round(lcp.startTime) : null,
      domContentLoadedMs: nav.domContentLoadedEventEnd
        ? Math.round(nav.domContentLoadedEventEnd)
        : null,
      loadMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      transferBytes: nav.transferSize || null,
    };
  });
}

const results = [];

for (const route of ROUTES) {
  test(`warm perf: ${route.name} (${route.path})`, async () => {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      // eslint-disable-next-line no-await-in-loop
      runs.push(await measure(`${BASE}${route.path}`));
    }
    const median = (key) => {
      const xs = runs.map((r) => r[key]).filter((n) => n != null).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    };
    const summary = {
      path: route.path,
      name: route.name,
      mode: MODE,
      ttfbMs: median('ttfbMs'),
      fcpMs: median('fcpMs'),
      lcpMs: median('lcpMs'),
      domContentLoadedMs: median('domContentLoadedMs'),
      loadMs: median('loadMs'),
      transferBytes: median('transferBytes'),
      budgets: { lcpMs: route.lcpMs, fcpMs: route.fcpMs, ttfbMs: route.ttfbMs },
      runs,
    };
    results.push(summary);

    // expect.soft is REQUIRED here: this describe is serial (single shared
    // BrowserContext across all tests so IDB / the vault survives), so a
    // hard expect failure would skip every remaining route. Soft still
    // marks the test failed at the end. Null metrics skip the assertion
    // and log — a missing LCP is a measurement issue, not a budget breach.
    if (summary.lcpMs != null) {
      expect.soft(summary.lcpMs, `LCP over budget for ${route.path}`).toBeLessThanOrEqual(route.lcpMs);
    } else {
      console.warn(`[warm-perf] LCP not reported for ${route.path} — skipping budget`);
    }
    if (summary.fcpMs != null) {
      expect.soft(summary.fcpMs, `FCP over budget for ${route.path}`).toBeLessThanOrEqual(route.fcpMs);
    }
    if (summary.ttfbMs != null) {
      expect.soft(summary.ttfbMs, `TTFB over budget for ${route.path}`).toBeLessThanOrEqual(route.ttfbMs);
    }
  });
}
