// src/pages/__tests__/TransactionHistory.i3-egress.test.js
//
// I3 defense-in-depth: the tx-history page's live indexer query must be DISABLED
// in a deniability (decoy/hidden) session, so the address->indexer disclosure is
// never even attempted. No render harness in this codebase — mirror the source-
// scan pattern (portfolioDeniability.test.js) and assert the query's `enabled`
// clause gates on !isDeniabilitySessionActive().
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../TransactionHistory.jsx'), 'utf8');

describe('TransactionHistory — I3 deniability gate', () => {
  it('imports isDeniabilitySessionActive', () => {
    expect(src).toMatch(/isDeniabilitySessionActive/);
  });
  it('the useQuery enabled clause gates on !isDeniabilitySessionActive()', () => {
    expect(src).toMatch(/enabled:\s*!isDeniabilitySessionActive\(\)/);
  });
});
