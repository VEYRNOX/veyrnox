// src/pages/__tests__/Calculator.deniability.test.js
//
// I3 deniability guard (source scan). The Calculator fetches CoinGecko prices via
// useQuery when the user navigates to it. Live prices default ON, so the enabled
// (isLivePricesEnabled()) lets it fetch in a decoy/hidden session. It MUST also
// gate on !isDecoy && !isHidden from useWallet(). When disabled it shows the
// existing "Live prices off" static state — no network call, no error reveal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../Calculator.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('Calculator — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('folds !isDecoy && !isHidden into the price-query enabled condition', () => {
    expect(code).toMatch(/isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden/);
  });
});

// ── DEMO egress suppression (source scan, mirrors useReceiveDetector.test.js) ──
//
// I3 gates decoy/hidden sessions, but a demo tour (veyrnox-demo=1, no unlocked
// vault) has isDecoy/isHidden === false, so isLivePricesEnabled() (a device-global
// opt-in) alone still lets the api.coingecko.com fetch fire when the Calculator is
// navigated to inside a demo tour on a browser that previously opted into live
// prices — a confirmed conditional leak. The canonical fix (ECC audit M-6,
// useReceiveDetector.js) folds DEMO into the pricesEnabled gate so the query is
// suppressed while demo mode is active. Disabled surfaces the existing neutral
// "Live prices off" static state — no network call, no error reveal.

describe('Calculator — DEMO egress suppression (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bDEMO\b[^}]*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('folds !DEMO into the pricesEnabled gate', () => {
    expect(code).toMatch(/!DEMO/);
    expect(code).toMatch(/&&\s*!DEMO|!DEMO\s*&&/);
  });

  it('the DEMO gate is defined before the price query definition', () => {
    const demoGate = code.search(/!DEMO/);
    expect(demoGate).toBeGreaterThan(-1);
    expect(demoGate).toBeLessThan(code.indexOf('queryFn: fetchPrices'));
  });
});
