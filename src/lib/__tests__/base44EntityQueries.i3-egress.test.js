// src/lib/__tests__/base44EntityQueries.i3-egress.test.js
//
// I3: the Base44 entity queries in WalletConnectProvider and WalletPortfolioPage
// emit backend traffic carrying real-wallet metadata (counterparty history,
// saved contacts, whitelist, token rows, spend limits). They must be sealed by
// the canonical deniability predicate.
//
// The regression this file exists for (live 2026-08-21 -> 2026-08-24, #1929):
// all four queries were gated on `!isDecoy && !isHidden` alone. Two problems
// with that shape, and BOTH have to stay closed:
//
//   1. isDecoy/isHidden are React state and LAG the module-level flag. A
//      panic/stealth transition calls setDeniabilitySession(true) before the
//      React flags update, leaving a window in which the query still emits.
//   2. Both flags are false during a demo tour, so a demo-blind gate leaks real
//      wallet metadata on a device that has real wallets — the same ruling the
//      project already made in #1992 for useAnalytics.
//
// Source-scan test, so it asserts the INVARIANT (the gate is demo-covering and
// is not the React flags alone) rather than one spelling of it. Mirrors
// useAnalytics.i3-egress.test.js deliberately: same class of defect, same
// shape of guard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, p), 'utf8');

const wcProvider = read('../WalletConnectProvider.jsx');
const portfolio = read('../../pages/WalletPortfolioPage.jsx');

/** The `enabled:` clause of every useQuery in a source file. */
const enabledClauses = (src) => src.match(/^\s*enabled:.*$/gm) ?? [];

/** The RHS of the `entityQueryEnabled` declaration, across its line wrap. */
const entityGate = (src) =>
  src.match(/const entityQueryEnabled\s*=\s*([\s\S]*?);/)?.[1]?.trim() ?? '';

describe.each([
  ['WalletConnectProvider.jsx', wcProvider],
  ['WalletPortfolioPage.jsx', portfolio],
])('%s — Base44 entity-query I3 seal', (_name, src) => {
  it('declares a single shared entityQueryEnabled gate', () => {
    expect(entityGate(src)).not.toBe('');
  });

  it('gates on a demo-covering deniability helper', () => {
    expect(entityGate(src)).toMatch(/!isDeniabilityOrDemoActive\(\)/);
  });

  it('imports that helper', () => {
    expect(src).toMatch(/isDeniabilityOrDemoActive/);
  });

  // The module flag leads the React flags, so the React flags alone are not a
  // seal. They are still required (they scope to the unlocked set), so this
  // asserts the helper is present ALONGSIDE them, not instead of them.
  it('does not rely on the React isDecoy/isHidden flags alone', () => {
    expect(entityGate(src)).toMatch(/!isDecoy/);
    expect(entityGate(src)).toMatch(/!isHidden/);
    expect(entityGate(src)).not.toMatch(/^!isDecoy && !isHidden$/);
  });

  it('requires an unlocked vault', () => {
    expect(entityGate(src)).toMatch(/\bisUnlocked\b/);
  });

  // The exact regressed clause. If any query is re-gated on the React flags
  // alone, this goes red.
  it('has no query still gated on the bare React-flag clause', () => {
    for (const clause of enabledClauses(src)) {
      expect(clause).not.toMatch(/enabled:\s*!isDecoy\s*&&\s*!isHidden\s*,?\s*$/);
    }
  });

  // deniabilitySession.js's docblock requires egress callers to use the live
  // helper: api/demoClient's DEMO is a load-time IIFE snapshot that misses a
  // flag set after import. Guard against a well-meaning "&& !DEMO" swap.
  it('does not substitute the load-time DEMO snapshot for the live helper', () => {
    expect(entityGate(src)).not.toMatch(/\bDEMO\b/);
  });
});

describe('WalletConnectProvider — the three entity queries share one gate', () => {
  // Three separate copies of the predicate is how the original drifted from the
  // relay effect in the same file. One const, referenced three times.
  it('references entityQueryEnabled from all three useQuery calls', () => {
    const uses = wcProvider.match(/enabled:\s*entityQueryEnabled\s*,/g) ?? [];
    expect(uses).toHaveLength(3);
  });

  it('seals them with the same predicate the relay effect uses', () => {
    // The relay effect (I3, WC WebSocket) is the in-file precedent this gate
    // was supposed to match. Both must name the demo-covering helper.
    expect(wcProvider).toMatch(
      /if \(isDeniabilityOrDemoActive\(\) \|\| !isUnlocked \|\| isDecoy \|\| isHidden/,
    );
    expect(entityGate(wcProvider)).toMatch(/!isDeniabilityOrDemoActive\(\)/);
  });
});

describe('WalletPortfolioPage — spend-limit query matches its own comment', () => {
  // Its comment said "Skip in deniability/demo" while the predicate was
  // demo-blind. Same class as the queries above; fixed in the same change so a
  // reader is not left with a comment that overclaims.
  it('gates the tx-limits query on the demo-covering helper', () => {
    const clause = portfolio.match(/queryKey: \["tx-limits"\][\s\S]*?enabled:.*$/m)?.[0] ?? '';
    expect(clause).not.toBe('');
    expect(clause).toMatch(/!isDeniabilityOrDemoActive\(\)/);
    expect(clause).not.toMatch(/!isDeniabilitySessionActive\(\)/);
  });
});
