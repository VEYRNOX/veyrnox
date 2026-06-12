// src/rasp/__tests__/i3-deniability.test.js
//
// RASP v1 — UNAUDITED-PROVISIONAL.  THE §5 AUDIT LINE-ITEM.
//
// I3 — deniability is sacred. The degradation RESPONSE must be identical across
// the real and decoy sets: same sentence copy, same friction, same blocked-action
// set, same tier — for EVERY detector condition. A response that differed by set
// would be a wallet-set oracle (an attacker who induces a known environment
// condition and watches the response learn that two sets exist), defeating D2
// (structural indistinguishability) and D4 (no credential-type disclosure) as
// surely as a visible wallet count.
//
// This mirrors the existing per-slot salt-identity deniability assertion and the
// Risk plane's i3-deniability test. It must be green before merge (§8).
//
// HOW THIS PROVES IT. degrade() is set-blind BY CONSTRUCTION — it takes
// `(condition)` and has no walletSet parameter and no import that can reach set
// identity (§5 structural enforcement). So we prove the guarantee two ways:
//   1. Structural: degrade's arity is 1 (no set handle is even accepted).
//   2. Behavioural: we install an ambient "active set" marker that a set-leaking
//      implementation MIGHT read, flip it real↔decoy, and assert the response
//      artifact is byte-identical for every condition.

import { describe, it, expect, afterEach } from 'vitest';
import { degrade } from '../degrade.js';
import { CONDITION } from '../conditions.js';

// Recursively collect every object key — used to prove no field names a set.
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

// Run degrade() with an ambient "which set is active" marker in scope. A correct
// (set-blind) implementation ignores it entirely; a leaking one might branch on
// it. We assert the marker makes no difference.
function degradeUnderActiveSet(condition, activeSet) {
  globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
  try {
    return degrade(condition);
  } finally {
    delete globalThis.__VEYRNOX_ACTIVE_SET__;
  }
}

afterEach(() => {
  delete globalThis.__VEYRNOX_ACTIVE_SET__;
});

const ALL_CONDITIONS = Object.values(CONDITION);

describe('I3 deniability — degradation response is identical real-vs-decoy', () => {
  it('degrade() accepts no wallet-set handle (arity is 1)', () => {
    // Structural guarantee: there is no set parameter to leak.
    expect(degrade.length).toBe(1);
  });

  it('every condition produces a byte-identical artifact under real vs decoy', () => {
    for (const condition of ALL_CONDITIONS) {
      const real = degradeUnderActiveSet(condition, 'real');
      const decoy = degradeUnderActiveSet(condition, 'decoy');

      // Byte-identical: same copy, same blocked-action set, same tier, same
      // friction. JSON.stringify is order-stable here because both artifacts are
      // built from the same spec with the same key order.
      expect(JSON.stringify(decoy)).toBe(JSON.stringify(real));
      expect(decoy).toEqual(real);
    }
  });

  it('also identical for an unknown (fail-closed) condition across sets', () => {
    const real = degradeUnderActiveSet('???unknown???', 'real');
    const decoy = degradeUnderActiveSet('???unknown???', 'decoy');
    expect(JSON.stringify(decoy)).toBe(JSON.stringify(real));
  });

  it('no artifact field names a set, decoy, wallet, or count', () => {
    for (const condition of ALL_CONDITIONS) {
      const keys = [...allKeys(degrade(condition))];
      for (const k of keys) {
        expect(k).not.toMatch(/\b(set|decoy|real|wallet|count|total|balance|holdings)\b/i);
      }
    }
  });

  it('no artifact VALUE leaks set identity (copy never says real/decoy/hidden)', () => {
    for (const condition of ALL_CONDITIONS) {
      const a = degrade(condition);
      if (a.sentence) {
        expect(a.sentence).not.toMatch(/\b(decoy|hidden wallet|real wallet|primary wallet)\b/i);
      }
    }
  });
});
