// src/risk/__tests__/s6-dust-input.test.js
//
// S6 — dust input present. Dusting deanonymises: an attacker sends a tiny tagged
// input hoping the victim consolidates it with real funds, linking addresses.
// Warn before a tx spends a known dust-tagged input. Active-set-scoped (I3):
// the dust tags are this set's own.
//
// Contract: tx spends a dust-tagged input → CAUTION; spends only clean inputs →
// OK; chain has no input concept (inputs undefined, e.g. EVM) → OK (N/A); inputs
// expected but unreadable → INDETERMINATE (fail closed).

import { describe, it, expect } from 'vitest';
import { s6DustInput } from '../signals/s6-dust-input.js';
import { LEVEL } from '../levels.js';

const tx = (inputs) => ({ to: 'tb1qclean', inputs, value: 0n });
const set = (dustInputs) => ({ dustInputs });

describe('S6 dust input', () => {
  it('HIT: tx consolidates a known dust-tagged input → CAUTION', () => {
    const { level, evidence } = s6DustInput(tx(['utxo:clean#0', 'utxo:dust#1']), set(['utxo:dust#1']), {});
    expect(level).toBe(LEVEL.CAUTION);
    expect(evidence.values.dustInputs).toContain('utxo:dust#1');
  });

  it('MISS: tx spends only clean inputs → OK', () => {
    expect(s6DustInput(tx(['utxo:clean#0', 'utxo:clean#1']), set(['utxo:dust#1']), {}).level).toBe(LEVEL.OK);
  });

  it('not applicable: chain has no input concept (inputs undefined) → OK', () => {
    expect(s6DustInput(tx(undefined), set(['utxo:dust#1']), {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: inputs expected but unreadable (present, not an array) → fail closed', () => {
    expect(s6DustInput(tx(null), set(['utxo:dust#1']), {}).level).toBe(LEVEL.INDETERMINATE);
  });
});
