// Playwright perf sweep — complements Lighthouse (single-page cold-load metrics)
// with cross-route navigation timings under repeated visits. Runs against the
// built preview server via BASE_URL, in demo mode so no real wallet state is
// exercised (I3: demo mode makes zero backend calls).
//
// Run:
//   BASE_URL=http://localhost:4173 npx playwright test perf/web-perf.spec.js \
//     --config=perf/playwright.perf.config.js
//
// Emits perf/results/web-perf.json with per-route timings; the workflow parses
// this into a step summary and fails the job if any route exceeds its budget.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const REPEATS = Number(process.env.PERF_REPEATS || 3);

// Route budgets — ms. Tuned against the current bundle; adjust deliberately
// (a passing perf run under a raised budget is not a passing perf run).
const ROUTES = [
  { path: '/?demo=1',           lcpMs: 2500, fcpMs: 1800, ttfbMs: 400 },
  { path: '/plans?demo=1',      lcpMs: 2800, fcpMs: 2000, ttfbMs: 400 },
  { path: '/settings?demo=1',   lcpMs: 2800, fcpMs: 2000, ttfbMs: 400 },
  { path: '/receive?demo=1',    lcpMs: 3000, fcpMs: 2000, ttfbMs: 400 },
  { path: '/calculator?demo=1', lcpMs: 2800, fcpMs: 2000, ttfbMs: 400 },
];

async function measure(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  // networkidle can return before the browser fires the LCP entry — on a
  // fast runner the app renders in <200ms and PerformanceObserver hasn't
  // reported the largest-contentful-paint yet. Poll for one, bounded.
  // If it never fires (some routes have no LCP-worthy element), we record
  // null and skip the LCP budget for that route rather than error.
  await page
    .waitForFunction(
      () => performance.getEntriesByType('largest-contentful-paint').length > 0,
      { timeout: 5000 }
    )
    .catch(() => {});
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    const lcp = performance
      .getEntriesByType('largest-contentful-paint')
      .slice(-1)[0];
    return {
      ttfbMs: nav.responseStart ? Math.round(nav.responseStart) : null,
      domContentLoadedMs: nav.domContentLoadedEventEnd
        ? Math.round(nav.domContentLoadedEventEnd)
        : null,
      loadMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      lcpMs: lcp ? Math.round(lcp.startTime) : null,
      transferBytes: nav.transferSize || null,
    };
  });
}

const results = [];

test.afterAll(() => {
  const dir = path.join(process.cwd(), 'perf', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'web-perf.json'),
    JSON.stringify({ base: BASE, repeats: REPEATS, results }, null, 2)
  );
});

for (const route of ROUTES) {
  test(`perf: ${route.path}`, async ({ page }) => {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      // eslint-disable-next-line no-await-in-loop
      runs.push(await measure(page, `${BASE}${route.path}`));
    }
    // Median across repeats — resistant to a single warm-up outlier.
    const median = (key) => {
      const xs = runs.map((r) => r[key]).filter((n) => n != null).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    };
    const summary = {
      path: route.path,
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

    // Soft-assert budgets so one route's miss can't hide numbers from
    // other routes (in this file tests aren't serial, but a hard expect
    // on a Playwright matcher error — e.g. toBeLessThanOrEqual(null) —
    // still aborts before results.push runs on a retry). Skip the
    // assertion entirely if a metric is null: null means the browser
    // never reported it (e.g. LCP on a route with no LCP-worthy element),
    // which is a measurement issue, not a budget breach.
    if (summary.lcpMs != null) {
      expect.soft(summary.lcpMs, `LCP over budget for ${route.path}`).toBeLessThanOrEqual(route.lcpMs);
    } else {
      console.warn(`[perf] LCP not reported for ${route.path} — skipping budget`);
    }
    if (summary.fcpMs != null) {
      expect.soft(summary.fcpMs, `FCP over budget for ${route.path}`).toBeLessThanOrEqual(route.fcpMs);
    }
    if (summary.ttfbMs != null) {
      expect.soft(summary.ttfbMs, `TTFB over budget for ${route.path}`).toBeLessThanOrEqual(route.ttfbMs);
    }
  });
}
