// src/risk/__tests__/i3-deniability.test.js
//
// I3 — deniability is sacred. The scorer is a pure function of the ACTIVE set's
// state; it has no notion of "real" vs "decoy" and never reads across sets. This
// test proves the GUARANTEE that follows from that: scoring the decoy set (on the
// decoy's own state) yields output STRUCTURALLY IDENTICAL to scoring the real set
// — same chrome, same copy logic, no field that betrays another set exists.
//
// An attacker watching the banner for one set must not be able to tell which set
// it is. So: for analogous scenarios, the verdict (level, signalId, sentence) and
// the whole result shape must match exactly between the two sets.

import { describe, it, expect } from 'vitest';
import { score } from '../score.js';
import { LEVEL } from '../levels.js';

// Reduce a value to its structural skeleton (keys + types, never values), so we
// can assert two results have the IDENTICAL shape regardless of the data inside.
function shapeOf(v) {
  if (Array.isArray(v)) return v.map(shapeOf);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = shapeOf(v[k]);
    return out;
  }
  return typeof v;
}

// Recursively collect every object key in the output — used to prove no key names
// a set, a decoy, a wallet, or a count.
function allKeys(v, acc = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      acc.add(k);
      allKeys(v[k], acc);
    }
  }
  return acc;
}

const chain = (recipientCode = '0x') => ({ recipientCode });
const REAL = '0xa11ce1234567890abcdef1234567890abcc0ffee';
const DECOY = '0xbb22de1234567890abcdef1234567890abcd1234';

describe('I3 deniability — decoy and real sets are indistinguishable in output', () => {
  it('a fresh-recipient INFO is shape- and verdict-identical across sets', () => {
    const realTx = { to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', data: '0x', value: 1n, chainId: 1, displayedEns: null };
    const decoyTx = { to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', data: '0x', value: 1n, chainId: 1, displayedEns: null };
    const realState = { sendHistory: [{ to: REAL }], counterparties: [REAL], priorSendValuesWei: [] };
    const decoyState = { sendHistory: [{ to: DECOY }], counterparties: [DECOY], priorSendValuesWei: [] };

    const real = score(realTx, realState, chain());
    const decoy = score(decoyTx, decoyState, chain());

    // Same verdict (INFO/S1), same exact sentence template.
    expect(real.level).toBe(LEVEL.INFO);
    expect(decoy.level).toBe(real.level);
    expect(decoy.signalId).toBe(real.signalId);
    expect(decoy.sentence).toBe(real.sentence);

    // Same overall shape — nothing structural differs between the two sets.
    expect(shapeOf(decoy)).toEqual(shapeOf(real));
  });

  it('a RISK poisoning verdict is shape- and verdict-identical across sets', () => {
    // Each recipient is a prefix/suffix lookalike of THAT set's own counterparty.
    const realTx = { to: '0xa11c00000000000000000000000000000000ffee', data: '0x', value: 1n, chainId: 1, displayedEns: null };
    const decoyTx = { to: '0xbb22000000000000000000000000000000001234', data: '0x', value: 1n, chainId: 1, displayedEns: null };
    const realState = { sendHistory: [], counterparties: [REAL], priorSendValuesWei: [] };
    const decoyState = { sendHistory: [], counterparties: [DECOY], priorSendValuesWei: [] };

    const real = score(realTx, realState, chain());
    const decoy = score(decoyTx, decoyState, chain());

    expect(real.level).toBe(LEVEL.RISK);
    expect(decoy.level).toBe(real.level);
    expect(decoy.signalId).toBe(real.signalId);
    expect(decoy.sentence).toBe(real.sentence); // identical copy, no "this is the real one" tell
    expect(shapeOf(decoy)).toEqual(shapeOf(real));
  });

  it('no output field names a set, decoy, wallet, or count', () => {
    const tx = { to: REAL, data: '0x', value: 1n, chainId: 1, displayedEns: null };
    const r = score(tx, { sendHistory: [{ to: REAL }], counterparties: [REAL], priorSendValuesWei: [] }, chain());
    const keys = [...allKeys(r)];
    for (const k of keys) {
      expect(k).not.toMatch(/\b(set|decoy|real|wallet|count|total|balance|holdings)\b/i);
    }
  });
});
