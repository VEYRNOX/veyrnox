// src/hooks/__tests__/useAnalytics.i3-egress.test.js
//
// I3 defense-in-depth: the analytics history aggregation query must be DISABLED
// in a deniability (decoy/hidden) session AND during a demo tour, so no
// per-asset address->indexer disclosure is attempted.
//
// Demo is not a separate case from deniability here — it is the SAME gate.
// isDecoy/isHidden are both false during a demo tour, so a gate that only
// checks the deniability session leaks real wallet addresses the moment a tour
// opens on a device that has real wallets. That was live until 2026-08-23.
//
// This is a source-scan test, so it asserts the invariant (the gate covers
// demo) rather than one spelling of it: any helper name is accepted as long as
// it is demo-covering, and the demo-BLIND helper is rejected outright.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../useAnalytics.js'), 'utf8');

// The `enabled:` clause of the historyQuery, isolated so the assertions below
// cannot be satisfied by a mention of a helper elsewhere in the file.
const enabledClause = src.match(/^\s*enabled:.*$/m)?.[0] ?? '';

describe('useAnalytics — I3 deniability + demo egress gate', () => {
  it('imports a demo-covering deniability helper', () => {
    expect(src).toMatch(/isDeniabilityOrDemoActive/);
  });

  it('has an enabled clause on the history query', () => {
    expect(enabledClause).not.toBe('');
  });

  it('gates the history query on the demo-covering helper', () => {
    expect(enabledClause).toMatch(/!isDeniabilityOrDemoActive\(\)/);
  });

  // The regression this file exists for. isDeniabilitySessionActive() returns
  // false during a demo tour, so gating on it alone re-opens the leak. If a
  // future change swaps the helper back, this goes red.
  it('does NOT gate on the demo-blind isDeniabilitySessionActive()', () => {
    expect(enabledClause).not.toMatch(/!isDeniabilitySessionActive\(\)/);
  });

  // api/demoClient's DEMO is a load-time IIFE snapshot: a flag set after module
  // import is missed. deniabilitySession.js's own docblock requires egress
  // callers to use the live helper instead. Guard against a well-meaning
  // "&& !DEMO" being substituted for it.
  it('does not rely on the load-time DEMO snapshot for this gate', () => {
    expect(src).not.toMatch(/from ['"]@?\/?(\.\.\/)*api\/demoClient['"]/);
  });
});
