// src/hooks/__tests__/usePriceAlertNotifier.test.js
//
// usePriceAlertNotifier needs a React render harness (not available in this
// project), so — mirroring src/notify/__tests__/useReceiveDetector.test.js — we
// source-scan for the I3 deniability guard: in a decoy/hidden (or locked) session
// the notifier must NOT subscribe, poll, or fire OS notifications about the
// shared-store REAL set's price alerts (incl. the user-authored note).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../usePriceAlertNotifier.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('usePriceAlertNotifier — I3 deniability structural guards (source scan)', () => {
  it('pulls isUnlocked/isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isUnlocked/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('short-circuits BOTH effects in deniability mode / when locked / in DEMO', () => {
    const guards = code.match(/if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*DEMO\s*\)\s*return/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2); // subscribe effect + poll effect
  });

  it('the guard precedes the PriceAlert subscribe (no real-set subscription in deniability mode)', () => {
    const firstGuard = code.search(/if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy/);
    expect(firstGuard).toBeGreaterThan(-1);

    // Tolerate optional chaining: the source is `PriceAlert?.subscribe?.(` since
    // the 2026-07-19 typecheck fix. A bare indexOf('PriceAlert.subscribe') no
    // longer matches and returns -1, which made this assertion fail with the
    // baffling "expected 1331 to be less than -1" rather than pointing at the
    // renamed call. Assert the subscribe site is FOUND before comparing
    // positions, so a future rename fails loudly instead of comparing against -1.
    const subscribeAt = code.search(/PriceAlert\??\.subscribe/);
    expect(subscribeAt).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(subscribeAt);
    // the poll effect's egress (fetchMarketPricesUsd usage) is likewise gated —
    // covered by the "short-circuits BOTH effects" count assertion above.
  });

  it('the deniability flags are in both effect dependency arrays', () => {
    const deps = code.match(/\[\s*queryClient,\s*isUnlocked,\s*isDecoy,\s*isHidden\s*\]/g) || [];
    expect(deps.length).toBeGreaterThanOrEqual(2);
  });
});

// ── DEMO gate (mirrors M-6 in notify/useReceiveDetector.js) ───────────────────
//
// The hook is mounted unconditionally at Layout.jsx (including demo sessions) and
// polls api.coingecko.com every 60s via fetchMarketPricesUsdCG. Today it is inert
// in demo ONLY by accident (WalletProvider.isUnlocked never flips true on the demo
// tour). Make that explicit: an EXPLICIT DEMO check in BOTH effect guards, so a
// future refactor cannot silently create a network-egress leak in demo (I2/I3).

describe('usePriceAlertNotifier — explicit DEMO gate (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('DEMO appears in BOTH effect early-return guards', () => {
    const guards = code.match(/if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*DEMO\s*\)\s*return/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it('the DEMO guard precedes the coingecko fetch (no market-price egress in demo)', () => {
    const hookSection = code.slice(code.indexOf('export function usePriceAlertNotifier'));
    const guardIdx = hookSection.indexOf('DEMO');
    const fetchCallIdx = hookSection.indexOf('fetchMarketPricesUsd(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(fetchCallIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(fetchCallIdx);
  });

  it('the DEMO guard precedes the PriceAlert subscribe (no real-set subscription in demo)', () => {
    const demoIdx = code.search(/isHidden\s*\|\|\s*DEMO/);
    expect(demoIdx).toBeGreaterThan(-1);
    expect(demoIdx).toBeLessThan(code.indexOf('PriceAlert.subscribe'));
  });
});
