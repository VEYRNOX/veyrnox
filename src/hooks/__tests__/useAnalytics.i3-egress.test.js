// src/hooks/__tests__/useAnalytics.i3-egress.test.js
//
// I3 defense-in-depth: the analytics history aggregation query must be DISABLED
// in a deniability (decoy/hidden) session so no per-asset address->indexer
// disclosure is attempted. Source-scan pattern — assert the existing `enabled`
// clause additionally gates on !isDeniabilitySessionActive().
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../useAnalytics.js'), 'utf8');

describe('useAnalytics — I3 deniability gate', () => {
  it('imports isDeniabilitySessionActive', () => {
    expect(src).toMatch(/isDeniabilitySessionActive/);
  });
  it('the historyQuery enabled clause gates on !isDeniabilitySessionActive()', () => {
    expect(src).toMatch(/enabled:[^\n]*!isDeniabilitySessionActive\(\)/);
  });
});
