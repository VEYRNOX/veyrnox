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

// ── DEMO egress suppression (source scan, mirrors useReceiveDetector.test.js) ──
//
// I3 gates decoy/hidden sessions, but a demo tour (veyrnox-demo=1, no unlocked
// vault) has isDecoy/isHidden === false, so the i3Active gate alone still lets the
// api.rss2json.com fetch fire — a confirmed live network leak. The canonical fix
// (ECC audit M-6, useReceiveDetector.js) is to also fold DEMO into the enabled
// gate so the query is suppressed while demo mode is active. The neutral
// network-silent placeholder ("No news available right now") covers this case —
// no fake news items are injected.

describe('CryptoNewsFeed — DEMO egress suppression (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bDEMO\b[^}]*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('folds !DEMO into the enabled gate for the news query', () => {
    // The gate that drives enabled: must include !DEMO so a demo session makes
    // zero calls to api.rss2json.com.
    expect(code).toMatch(/!DEMO/);
    expect(code).toMatch(/&&\s*!DEMO|!DEMO\s*&&/);
  });

  it('the DEMO gate is defined before the news query definition', () => {
    const demoGate = code.search(/!DEMO/);
    expect(demoGate).toBeGreaterThan(-1);
    expect(demoGate).toBeLessThan(code.indexOf('fetchCryptoNews,'));
  });
});
