// src/pages/__tests__/FeeAnalytics.i3-egress.test.js
//
// I3 defense-in-depth: the fee-analytics page's live indexer query must be
// DISABLED in a deniability (decoy/hidden) session. Source-scan pattern
// (see portfolioDeniability.test.js) — assert the `enabled` clause gates on
// !isDeniabilitySessionActive().
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../FeeAnalytics.jsx'), 'utf8');

describe('FeeAnalytics — I3 deniability gate', () => {
  it('imports isDeniabilitySessionActive', () => {
    expect(src).toMatch(/isDeniabilitySessionActive/);
  });
  it('the useQuery enabled clause gates on !isDeniabilitySessionActive()', () => {
    expect(src).toMatch(/enabled:\s*!isDeniabilitySessionActive\(\)/);
  });
});
