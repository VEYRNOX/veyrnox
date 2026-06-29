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
