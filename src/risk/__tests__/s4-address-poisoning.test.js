// src/risk/__tests__/s4-address-poisoning.test.js
//
// S4 — address poisoning / lookalike. The attacker seeds the victim's history
// with an address that LOOKS like a real counterparty (same truncated head/tail,
// or a near-duplicate off by a char) hoping the victim copies the wrong row.
// Active-set-scoped only (I3): the reference set is THIS set's counterparties.
//
// Two complementary detectors, tested at the boundary:
//   - prefix/suffix lookalike: same first-4 + last-4 nibbles, different middle.
//   - low Levenshtein: near-duplicate where the diff sits OUTSIDE the head/tail
//     (so the prefix/suffix rule alone would miss it).
// A legitimately-similar address (shares only a prefix, far apart overall) and an
// EXACT known match must NOT fire — crying wolf trains users to ignore the chip.

import { describe, it, expect } from 'vitest';
import { s4AddressPoisoning } from '../signals/s4-address-poisoning.js';
import { LEVEL } from '../levels.js';

// body: a11ce123 4567890a bcdef123 4567890a bcc0ffee  (prefix a11c, suffix ffee)
const KNOWN = '0xa11ce1234567890abcdef1234567890abcc0ffee';

const tx = (to) => ({ to, data: '0x', value: 0n, chainId: 11155111 });
const set = (counterparties) => ({ counterparties });

describe('S4 address poisoning', () => {
  it('HIT (prefix/suffix): same head+tail, different middle, not equal → RISK', () => {
    const poison = '0xa11c00000000000000000000000000000000ffee';
    const { level, evidence } = s4AddressPoisoning(tx(poison), set([KNOWN]), {});
    expect(level).toBe(LEVEL.RISK);
    expect(evidence.values.recipient.toLowerCase()).toBe(poison);
    expect(evidence.values.resembles.toLowerCase()).toBe(KNOWN);
  });

  it('HIT (low Levenshtein): off-by-one in the HEAD so prefix rule misses → RISK', () => {
    // index 1 of the body flipped (1 → 2): prefix becomes a21c, suffix still ffee.
    const near = '0xa21ce1234567890abcdef1234567890abcc0ffee';
    expect(s4AddressPoisoning(tx(near), set([KNOWN]), {}).level).toBe(LEVEL.RISK);
  });

  it('MISS: exact match to a known counterparty (case-insensitive) → OK', () => {
    expect(s4AddressPoisoning(tx(KNOWN.toUpperCase()), set([KNOWN]), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: legitimately similar (shares only the prefix, far apart) → OK', () => {
    const similar = '0xa11cffffffffffffffffffffffffffffffff1234';
    expect(s4AddressPoisoning(tx(similar), set([KNOWN]), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: an entirely unrelated recipient → OK', () => {
    const other = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    expect(s4AddressPoisoning(tx(other), set([KNOWN]), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: no counterparties to compare against → OK (cannot be a lookalike of nothing)', () => {
    const poison = '0xa11c00000000000000000000000000000000ffee';
    expect(s4AddressPoisoning(tx(poison), set([]), {}).level).toBe(LEVEL.OK);
  });

  it('not applicable: a non-EVM / unparseable recipient → OK (no hex body to compare)', () => {
    expect(s4AddressPoisoning(tx('bc1qxyznotanevmaddress'), set([KNOWN]), {}).level).toBe(LEVEL.OK);
  });
});
