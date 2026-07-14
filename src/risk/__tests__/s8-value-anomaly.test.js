// src/risk/__tests__/s8-value-anomaly.test.js
//
// S8 — value-vs-history anomaly. A send far above this wallet-set's typical SEND
// magnitude is surfaced as a neutral INFO chip. CRITICAL (I2 holdings-decoupling):
// S8 reads ONLY prior SEND magnitudes — never total balance, asset count, or
// anything that could leak holdings. The input state carries no balance field at
// all; this is structural, not a check.
//
// Contract: value ≫ rolling typical send → INFO; value in line → OK; too little
// history for a baseline → OK (honest gating, silent — an INFO that can't form a
// baseline must NOT escalate); value missing/invalid → INDETERMINATE (fail closed).

import { describe, it, expect } from 'vitest';
import { parseEther } from 'ethers';
import { s8ValueAnomaly, S8_CONSTANTS } from '../signals/s8-value-anomaly.js';
import { LEVEL } from '../levels.js';

const tx = (value) => ({ to: '0xabc', data: '0x', value, chainId: 11155111 });
const set = (priorSendValuesWei) => ({ priorSendValuesWei });

const typical = [parseEther('0.02'), parseEther('0.03'), parseEther('0.025'), parseEther('0.02')];

describe('S8 value-vs-history anomaly', () => {
  it('HIT: value far above the typical send (median) → INFO', () => {
    const { level, evidence } = s8ValueAnomaly(tx(parseEther('5')), set(typical), {});
    expect(level).toBe(LEVEL.INFO);
    // Evidence is shown human-readable (ether), NOT raw wei, so the banner row
    // is verifiable rather than an 18-digit integer.
    expect(evidence.values.value).toBe('5.0');
    expect(evidence.values.typical).toBe('0.025'); // upper-middle of even-length [0.02,0.02,0.025,0.03] (L-3 fix)
  });

  it('MISS: value in line with the typical send → OK', () => {
    expect(s8ValueAnomaly(tx(parseEther('0.03')), set(typical), {}).level).toBe(LEVEL.OK);
  });

  it('MISS: too little history to form a baseline → OK (silent, does not escalate)', () => {
    expect(s8ValueAnomaly(tx(parseEther('100')), set([parseEther('0.02')]), {}).level).toBe(LEVEL.OK);
  });

  it('INDETERMINATE: value missing/invalid → fail closed', () => {
    expect(s8ValueAnomaly(tx(undefined), set(typical), {}).level).toBe(LEVEL.INDETERMINATE);
  });

  it('exposes its tunable thresholds and they are sane', () => {
    expect(S8_CONSTANTS.MULTIPLE).toBeGreaterThan(1);
    expect(S8_CONSTANTS.MIN_HISTORY).toBeGreaterThanOrEqual(2);
  });
});
