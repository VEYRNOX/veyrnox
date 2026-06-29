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
