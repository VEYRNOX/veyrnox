// src/lib/__tests__/priceFeed.deniability.test.js
//
// I3 deniability guard (source scan). useLivePrices polls CoinGecko, and live
// prices default ON. Its enabled condition is only isLivePricesEnabled() (a
// localStorage pref), so in a decoy/hidden session it polls CoinGecko by default.
// The hook MUST also gate on !isDecoy && !isHidden from useWallet(), so a
// deniability session makes zero price egress (I3). Disabled returns null data —
// identical to "live prices off", so there is no visual tell.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../priceFeed.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('useLivePrices — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('folds !isDecoy && !isHidden into the enabled condition', () => {
    expect(code).toMatch(/isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden/);
  });
});
