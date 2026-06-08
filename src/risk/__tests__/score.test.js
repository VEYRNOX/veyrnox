// src/risk/__tests__/score.test.js
//
// Composite scorer. Combines the eight signals into ONE verdict:
//   priority: RISK > CAUTION > INFO > OK
//   INDETERMINATE → treated as CAUTION (I4 fail-closed escalation)
//   composite = max-priority fired signal; that signal owns the ONE sentence.
// A signal that THROWS must block (escalate), not bypass (silently pass).

import { describe, it, expect } from 'vitest';
import { Interface, MaxUint256, parseEther, parseUnits } from 'ethers';
import { score } from '../score.js';
import { LEVEL } from '../levels.js';

const iface = new Interface(['function approve(address spender, uint256 value)']);
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const KNOWN = '0xa11ce1234567890abcdef1234567890abcc0ffee';

// A complete, benign context: a small native send to a KNOWN recipient, with all
// the local state and chain data the signals need to evaluate cleanly to OK.
function benign(overrides = {}) {
  const tx = {
    to: KNOWN,
    data: '0x',
    value: parseEther('0.03'),
    chainId: 11155111,
    displayedEns: null,
    ...overrides.tx,
  };
  const state = {
    sendHistory: [{ to: KNOWN }],
    counterparties: [KNOWN],
    knownGoodSpenders: [SPENDER],
    dustInputs: [],
    ensCache: {},
    priorSendValuesWei: [parseEther('0.02'), parseEther('0.03'), parseEther('0.025'), parseEther('0.02')],
    ...overrides.state,
  };
  const chain = { recipientCode: '0x', ...overrides.chain };
  return [tx, state, chain];
}

describe('composite score', () => {
  it('all signals clear → OK, no sentence (sign proceeds)', () => {
    const r = score(...benign());
    expect(r.level).toBe(LEVEL.OK);
    expect(r.sentence).toBeNull();
  });

  it('always returns one entry per signal, same shape (deniability-safe structure)', () => {
    const r = score(...benign());
    expect(Array.isArray(r.signals)).toBe(true);
    expect(r.signals).toHaveLength(8);
    for (const s of r.signals) {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('level');
      expect(s.evidence).toHaveProperty('reason');
    }
  });

  it('a fresh recipient alone → INFO with that signal owning the sentence', () => {
    const r = score(...benign({ tx: { to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, state: { sendHistory: [], counterparties: [] } }));
    expect(r.level).toBe(LEVEL.INFO);
    expect(r.sentence).toMatch(/first time/i);
    expect(r.signalId).toBe('S1');
  });

  it('RISK outranks everything else and owns the one sentence', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    // approve to a contract spender; also a fresh recipient (INFO) in the mix.
    const r = score(...benign({
      tx: { to: SPENDER, data, value: 0n },
      state: { sendHistory: [], counterparties: [] },
      chain: { recipientCode: '0x6080' },
    }));
    expect(r.level).toBe(LEVEL.RISK);
    expect(r.sentence).toMatch(/unlimited/i);
    expect(r.signalId).toBe('S2');
  });

  it('INDETERMINATE escalates to CAUTION (fail closed), never OK', () => {
    // A displayed ENS that cannot be resolved → S5 INDETERMINATE → CAUTION.
    const r = score(...benign({ tx: { displayedEns: 'alice.eth' }, state: { ensCache: {} } }));
    expect(r.level).toBe(LEVEL.CAUTION);
    expect(r.signalId).toBe('S5');
  });

  it('a thrown signal BLOCKS (escalates to CAUTION), it does not bypass to OK', () => {
    const boom = { id: 'BOOM', fn: () => { throw new Error('signal crashed'); } };
    const r = score(...benign(), [boom]);
    expect(r.level).toBe(LEVEL.CAUTION);
    expect(r.level).not.toBe(LEVEL.OK);
  });

  it('returns exactly one sentence even when several signals fire', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const r = score(...benign({
      tx: { to: SPENDER, data, value: 0n, displayedEns: 'x.eth' }, // S2 RISK + S3 RISK + S5 INDET + ...
      state: { sendHistory: [], counterparties: [], knownGoodSpenders: [], ensCache: {} },
      chain: { recipientCode: '0x6080' },
    }));
    expect(typeof r.sentence).toBe('string');
    expect(r.sentence.length).toBeGreaterThan(0);
    expect(r.level).toBe(LEVEL.RISK);
  });
});
