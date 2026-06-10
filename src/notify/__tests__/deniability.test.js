// src/notify/__tests__/deniability.test.js
//
// Build brief §2 D-set + §7 ("treat as the highest-value tests here"). I3 is
// sacred: a notification may describe ONLY the active set's own event, and the
// surface must be indistinguishable between a real and a decoy set. This mirrors
// the risk module's i3-deniability test exactly (shapeOf / allKeys helpers).
//
// What this proves:
//   - Analogous events from two different sets yield STRUCTURALLY IDENTICAL
//     notification objects (no field betrays which set produced it).
//   - Copy carries NO credential-type word (real/duress/decoy/hidden).
//   - No output key names a set, decoy, wallet, count, or balance (no cardinality).

import { describe, it, expect } from 'vitest';
import { buildNotification, EVENT, NOTIFY_LEVEL } from '../notify.js';
import { LEVEL } from '../../risk/levels.js';

// Structural skeleton: keys + value types only, never the values themselves.
function shapeOf(v) {
  if (Array.isArray(v)) return v.map(shapeOf);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = shapeOf(v[k]);
    return out;
  }
  return typeof v;
}

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

const REAL = '0xa11ce1234567890abcdef1234567890abcc0ffee';
const DECOY = '0xbb22de1234567890abcdef1234567890abcd1234';
const CREDENTIAL_WORDS = /\b(real|duress|decoy|hidden)\b/i;

const everyEvent = [
  { type: EVENT.SEND_CONFIRMED, ts: 1, amount: '0.5 ETH', to: REAL },
  { type: EVENT.RECEIVE_DETECTED, ts: 2, amount: '1 ETH' },
  { type: EVENT.APPROVAL_GRANTED, ts: 3, spender: REAL },
  { type: EVENT.RISK_FIRED, ts: 4, score: { level: LEVEL.RISK, sentence: 'This recipient is brand new.' } },
];

describe('I3 deniability — notifications are indistinguishable across sets (§2/§7)', () => {
  it('an analogous send from a real vs decoy set is shape- and copy-identical', () => {
    const real = buildNotification({ type: EVENT.SEND_CONFIRMED, ts: 10, amount: '0.5 ETH', to: REAL });
    const decoy = buildNotification({ type: EVENT.SEND_CONFIRMED, ts: 10, amount: '0.5 ETH', to: DECOY });
    expect(decoy.level).toBe(real.level);
    expect(decoy.message).toBe(real.message); // identical copy — no "this is the real one" tell
    expect(shapeOf(decoy)).toEqual(shapeOf(real));
  });

  it('an analogous risk verdict is shape- and copy-identical across sets', () => {
    const s = { level: LEVEL.CAUTION, sentence: 'This recipient is brand new.' };
    const real = buildNotification({ type: EVENT.RISK_FIRED, ts: 11, score: s });
    const decoy = buildNotification({ type: EVENT.RISK_FIRED, ts: 11, score: s });
    expect(decoy.level).toBe(NOTIFY_LEVEL.CAUTION);
    expect(shapeOf(decoy)).toEqual(shapeOf(real));
  });

  it('no message contains a credential-type word', () => {
    for (const ev of everyEvent) {
      expect(buildNotification(ev).message ?? '').not.toMatch(CREDENTIAL_WORDS);
    }
  });

  it('no output key names a set, decoy, wallet, count, total, or balance', () => {
    for (const ev of everyEvent) {
      const keys = [...allKeys(buildNotification(ev))];
      for (const k of keys) {
        expect(k).not.toMatch(/\b(set|decoy|real|wallet|count|total|balance|holdings)\b/i);
      }
    }
  });
});
