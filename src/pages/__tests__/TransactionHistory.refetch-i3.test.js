// src/pages/__tests__/TransactionHistory.refetch-i3.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../TransactionHistory.jsx'), 'utf8');

describe('TransactionHistory #1121 refetch I3 gate', () => {
  it('imports isDeniabilityOrDemoActive', () => {
    expect(src).toMatch(/isDeniabilityOrDemoActive/);
  });
  it('computes egressAllowed = !isDeniabilityOrDemoActive()', () => {
    expect(src).toMatch(/egressAllowed\s*=\s*!isDeniabilityOrDemoActive\(\)/);
  });
  it('every refetch button is gated by egressAllowed', () => {
    const refetchMatches = [...src.matchAll(/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*refetch\s*\(\s*\)\s*\}/g)];
    expect(refetchMatches.length).toBeGreaterThan(0);
    for (const m of refetchMatches) {
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      const gateRe = /\{\s*egressAllowed\s*&&\s*\(/g;
      let lastGateEnd = -1;
      let gm;
      while ((gm = gateRe.exec(before))) lastGateEnd = gm.index + gm[0].length;
      expect(lastGateEnd).toBeGreaterThan(-1);
      expect(before.slice(lastGateEnd)).not.toMatch(/\)\s*\}/);
    }
  });
});

describe('RULE3 exemption removed for TransactionHistory', () => {
  it('not in RULE3_LEGACY_EXEMPT_PATHS', () => {
    const s = readFileSync(resolve(here, '../../../scripts/check-deniability-strings.mjs'), 'utf8');
    const m = s.match(/RULE3_LEGACY_EXEMPT_PATHS\s*=\s*\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toMatch(/TransactionHistory/);
  });
});