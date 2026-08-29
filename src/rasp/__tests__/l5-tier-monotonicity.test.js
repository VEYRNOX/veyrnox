// L-5 (weekly audit 2026-08-25) — DANGER-MONOTONICITY of the degradation ladder.
//
// THE BUG. CONDITION.EMULATOR is a BLOCK tier yet carried `blockedActions: ['sign']`
// only, while ROOTED and INTEGRITY_UNAVAILABLE — both ranked LOWER on the danger
// ladder — carried ['seed-reveal','export','import']. Because attestation.js ranks
// EMULATOR above ROOTED, a rooted AND emulated device composed to EMULATOR and seed
// reveal was PERMITTED: the stronger tier granted MORE key-material access than the
// weaker one.
//
// THE INVARIANT. If condition B is strictly more dangerous than condition A, then
// B must block at least everything A blocks. Asserted generally over every ordered
// pair, using the public composeConditions() as the ranking oracle (DANGER_RANK is
// module-private), so any future condition or spec edit that re-opens this class of
// inversion turns this red — not just the EMULATOR instance.

import { describe, it, expect } from 'vitest';
import { degrade } from '../degrade.js';
import { composeConditions } from '../attestation.js';
import { CONDITION } from '../conditions.js';

const ALL = Object.values(CONDITION);

// True when b is strictly more dangerous than a: compose() returns b whichever way
// round it is called (it returns the FIRST argument on a rank tie, so requiring both
// orders excludes ties).
function strictlyMoreDangerous(a, b) {
  return composeConditions(a, b) === b && composeConditions(b, a) === b;
}

describe('L-5 — danger-monotonic blockedActions', () => {
  it('a more dangerous condition never blocks LESS than a weaker one', () => {
    for (const a of ALL) {
      for (const b of ALL) {
        if (a === b || !strictlyMoreDangerous(a, b)) continue;
        const weak = degrade(a).blockedActions;
        const strong = degrade(b).blockedActions;
        for (const action of weak) {
          expect(
            strong,
            `${b} (more dangerous than ${a}) must also block "${action}"`,
          ).toContain(action);
        }
      }
    }
  });

  it('EMULATOR blocks the full sensitive set, not just sign', () => {
    const a = degrade(CONDITION.EMULATOR);
    for (const action of ['sign', 'seed-reveal', 'export', 'import']) {
      expect(a.blockedActions, action).toContain(action);
    }
  });

  it('rooted AND emulated composes to EMULATOR and still blocks seed reveal', () => {
    const composed = composeConditions(CONDITION.ROOTED, CONDITION.EMULATOR);
    expect(composed).toBe(CONDITION.EMULATOR);
    expect(degrade(composed).blockedActions).toContain('seed-reveal');
  });

  it('the fail-closed default still blocks everything any known condition blocks', () => {
    const failClosed = degrade('???not-a-condition???').blockedActions;
    for (const condition of ALL) {
      for (const action of degrade(condition).blockedActions) {
        expect(failClosed, `${condition} → ${action}`).toContain(action);
      }
    }
  });
});
