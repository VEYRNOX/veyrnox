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

  it('short-circuits BOTH effects in deniability mode / when locked', () => {
    const guards = code.match(/if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\)\s*return/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2); // subscribe effect + poll effect
  });

  it('the guard precedes the PriceAlert subscribe (no real-set subscription in deniability mode)', () => {
    const firstGuard = code.search(/if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy/);
    expect(firstGuard).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(code.indexOf('PriceAlert.subscribe'));
    // the poll effect's egress (fetchMarketPricesUsd usage) is likewise gated —
    // covered by the "short-circuits BOTH effects" count assertion above.
  });

  it('the deniability flags are in both effect dependency arrays', () => {
    const deps = code.match(/\[\s*queryClient,\s*isUnlocked,\s*isDecoy,\s*isHidden\s*\]/g) || [];
    expect(deps.length).toBeGreaterThanOrEqual(2);
  });
});
