// src/risk/__tests__/s5-ens-mismatch.test.js
//
// S5 — ENS / resolved mismatch. If the UI showed the user a human name (ENS) but
// the tx is actually going to a DIFFERENT address than that name resolves to, the
// display was a lie and the send must be stopped. Resolution is local-cache-only
// (deterministic, no network — the cache was filled when the UI resolved the name
// to display it). A resolution that cannot be checked fails CLOSED.
//
// Contract: name resolves to ≠ recipient → RISK; resolves to == recipient → OK;
// name present but not resolvable from cache → INDETERMINATE (never OK); no name
// shown (raw-address send) → OK (not applicable).

import { describe, it, expect } from 'vitest';
import { s5EnsMismatch } from '../signals/s5-ens-mismatch.js';
import { LEVEL } from '../levels.js';

const A = '0xa11ce1234567890abcdef1234567890abcc0ffee';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const tx = (to, displayedEns) => ({ to, displayedEns, data: '0x', value: 0n, chainId: 1 });
const state = (ensCache) => ({ ensCache });

describe('S5 ENS mismatch', () => {
  it('HIT: displayed name resolves to a DIFFERENT address than the recipient → RISK', () => {
    const { level, evidence } = s5EnsMismatch(tx(B, 'alice.eth'), state({ 'alice.eth': A }), {});
    expect(level).toBe(LEVEL.RISK);
    expect(evidence.values.ens).toBe('alice.eth');
    expect(evidence.values.resolved.toLowerCase()).toBe(A);
    expect(evidence.values.recipient.toLowerCase()).toBe(B.toLowerCase());
  });

  it('MISS: displayed name resolves to the SAME address (case-insensitive) → OK', () => {
    // recipient is checksummed (mixed-case), cache holds the lowercase form.
    expect(s5EnsMismatch(tx(B, 'alice.eth'), state({ 'alice.eth': B.toLowerCase() }), {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: name shown but not resolvable from cache → fail closed, never OK', () => {
    const { level } = s5EnsMismatch(tx(B, 'alice.eth'), state({}), {});
    expect(level).toBe(LEVEL.INDETERMINATE);
  });

  it('INDETERMINATE: cache holds an unparseable address for the name → fail closed', () => {
    const { level } = s5EnsMismatch(tx(B, 'alice.eth'), state({ 'alice.eth': 'not-an-address' }), {});
    expect(level).toBe(LEVEL.INDETERMINATE);
  });

  it('not applicable: a raw-address send (no displayed name) → OK', () => {
    expect(s5EnsMismatch(tx(B, null), state({ 'alice.eth': A }), {}).level).toBe(LEVEL.OK);
  });
});
