// src/risk/__tests__/s1-fresh-recipient.test.js
//
// S1 — fresh recipient. A recipient absent from THIS wallet-set's send history is
// surfaced as a neutral INFO chip ("Fresh recipient"). Active-set-scoped (I3):
// history is the active set's own prior sends, never read across sets. Works for
// any chain (EVM/BTC/SOL) — comparison is case-insensitive for 0x addresses and
// exact otherwise.
//
// Contract: recipient ∉ history → INFO; recipient ∈ history → OK; no recipient to
// evaluate → INDETERMINATE (fail closed).

import { describe, it, expect } from 'vitest';
import { s1FreshRecipient } from '../signals/s1-fresh-recipient.js';
import { LEVEL } from '../levels.js';

const A = '0xa11ce1234567890abcdef1234567890abcc0ffee';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BTC = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

const tx = (to) => ({ to, data: '0x', value: 0n, chainId: 11155111 });
const set = (sendHistory) => ({ sendHistory });

describe('S1 fresh recipient', () => {
  it('HIT: recipient not in the send history → INFO', () => {
    const { level, evidence } = s1FreshRecipient(tx(B), set([{ to: A }]), {});
    expect(level).toBe(LEVEL.INFO);
    expect(evidence.values.recipient.toLowerCase()).toBe(B.toLowerCase());
  });

  it('MISS: recipient already in history (case-insensitive EVM) → OK', () => {
    expect(s1FreshRecipient(tx(A), set([{ to: A.toUpperCase().replace('0X', '0x') }]), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: non-EVM recipient already in history (exact match) → OK', () => {
    expect(s1FreshRecipient(tx(BTC), set([{ to: BTC }]), {}).level).toBe(LEVEL.OK);
  });

  it('accepts plain-string history entries as well as { to } records', () => {
    expect(s1FreshRecipient(tx(A), set([A]), {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: no recipient on the tx → fail closed', () => {
    expect(s1FreshRecipient(tx(undefined), set([{ to: A }]), {}).level).toBe(LEVEL.INDETERMINATE);
  });
});
