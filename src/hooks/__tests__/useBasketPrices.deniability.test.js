// src/hooks/__tests__/useBasketPrices.deniability.test.js
//
// I3 deniability guard (source scan). useBasketPrices polls the 24h-change feed
// and live prices default ON, so its enabled (isLivePricesEnabled()) lets it poll
// in a decoy/hidden session. It MUST also gate on !isDecoy && !isHidden from
// useWallet() → zero egress in a deniability session (I3). Disabled returns the
// same isLive=false / null-delta shape as "live off", so there is no visual tell.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../useBasketPrices.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('useBasketPrices — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('folds !isDecoy && !isHidden into the enabled condition', () => {
    expect(code).toMatch(/isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden/);
  });
});

// ── DEMO egress suppression (source scan, mirrors useReceiveDetector.test.js) ──
//
// I3 gates decoy/hidden sessions, but a demo tour (veyrnox-demo=1, no unlocked
// vault) has isDecoy/isHidden === false, so isLivePricesEnabled() (a device-global
// opt-in) alone still lets the api.coingecko.com basket poll fire when a browser
// previously opted into live prices — a confirmed conditional network leak. The
// canonical fix (ECC audit M-6, useReceiveDetector.js) folds DEMO into the enabled
// gate so the query is suppressed while demo mode is active. Disabled reuses the
// same isLive=false / null-delta fail-honest shape — no mock data, no visual tell.

describe('useBasketPrices — DEMO egress suppression (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bDEMO\b[^}]*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('folds !DEMO into the enabled gate for the basket query', () => {
    expect(code).toMatch(/!DEMO/);
    expect(code).toMatch(/&&\s*!DEMO|!DEMO\s*&&/);
  });

  it('folds !DEMO into the same enabled gate as the deniability flags', () => {
    // The gate is inline in the query config's `enabled` field, so it sits with
    // isLivePricesEnabled()/!isDecoy/!isHidden — assert !DEMO is part of that
    // single enabled expression (one conjunction, not a separate ungated path).
    expect(code).toMatch(/enabled:\s*isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden\s*&&\s*!DEMO/);
  });
});
