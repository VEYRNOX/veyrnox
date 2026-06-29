// src/components/__tests__/CryptoNewsFeed.deniability.test.js
//
// I3 deniability guard (source scan, mirroring usePriceAlertNotifier.test.js).
// CryptoNewsFeed fires a useQuery on mount that calls api.rss2json.com (a
// third-party RSS proxy) every time the Dashboard / NewsSentiment page renders.
// In a decoy or hidden session that is unauthorised network egress, violating I3
// (deniable sessions make zero backend calls). The query MUST be enabled-gated on
// !isDecoy && !isHidden — matching the canonical GasTracker.jsx fix.
//
// Honesty: when disabled the component must render a neutral placeholder, NOT an
// error state, so an observer cannot tell a deniability session from a load.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../CryptoNewsFeed.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('CryptoNewsFeed — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('gates the news useQuery enabled on !isDecoy && !isHidden', () => {
    // The query that calls fetchCryptoNews must carry an enabled flag derived
    // from the deniability flags (the GasTracker canonical pattern).
    expect(code).toMatch(/!isDecoy\s*&&\s*!isHidden/);
    expect(code).toMatch(/enabled\s*:/);
  });

  it('the deniability guard precedes the news query definition', () => {
    const guard = code.search(/!isDecoy\s*&&\s*!isHidden/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(code.indexOf('fetchCryptoNews,'));
  });
});
