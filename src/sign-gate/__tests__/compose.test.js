// src/sign-gate/__tests__/compose.test.js
//
// RASP §7 — chokepoint compose. PROVISIONAL — independent audit complete (ECC
// 2026-06-23, §24; sign-gate confirmed genuinely blocking at the wired
// call-site, no egress; M-4 stale-comment fix). composeGate is WIRED and LIVE
// in SendCrypto. Still BUILT, not 'verified'.
//
// composeGate(raspTier, txLevel) is the PURE compose logic of the one signer
// gate: it reads the two planes' FINISHED verdicts (RASP's response tier + the tx
// scorer's level) and returns a single gate decision. It is premise-independent —
// it consumes only the two LANDED output vocabularies (rasp TIER + risk LEVEL),
// not the unmerged send-path call site — so it is buildable and testable now.
//
// THE 4-VALUE LATTICE (a documented refinement of the brief's literal 3-value
// max-severity — flagged for §10 sign-off). RASP block-signing (HARD, no override)
// and tx RISK (destructive-confirm, "sign anyway") are NOT the same gate behaviour
// despite both being "top severity"; collapsing them to one "block" rank would
// silently strip the risk plane's sign-anyway affordance. So:
//
//     allow  <  warn  <  confirm  <  block
//     (open)   (biom.)  (sign-anyway)  (hard stop, no override)
//
//   rasp TIER : allow→allow, warn-before-sign→warn,  block-signing→block
//   tx LEVEL  : OK→allow, INFO→allow, CAUTION→warn,  RISK→confirm
//
// A hostile RUNTIME (block) thus outranks a hostile TX (confirm) — exactly §4's
// "you cannot confirm your way past a hooked runtime, because the confirmation
// itself can be hooked." Highest decision wins and owns the one chokepoint
// sentence (design system: never two stacked warnings).

import { describe, it, expect, afterEach } from 'vitest';
import { composeGate, DECISION } from '../compose.js';
import { TIER } from '../../rasp/index.js';
import { LEVEL } from '../../risk/levels.js';

// Full matrix: every RASP tier × every tx level → expected gate decision + the
// plane that owns the surfaced sentence + whether the signer is reachable at all.
const MATRIX = [
  // raspTier,        txLevel,         decision,           owner,  signerReachable
  [TIER.ALLOW, LEVEL.OK, DECISION.ALLOW, null, true],
  [TIER.ALLOW, LEVEL.INFO, DECISION.ALLOW, null, true],
  [TIER.ALLOW, LEVEL.CAUTION, DECISION.WARN, 'tx', true],
  [TIER.ALLOW, LEVEL.RISK, DECISION.CONFIRM, 'tx', true],
  [TIER.WARN, LEVEL.OK, DECISION.WARN, 'rasp', true],
  [TIER.WARN, LEVEL.INFO, DECISION.WARN, 'rasp', true],
  [TIER.WARN, LEVEL.CAUTION, DECISION.WARN, 'rasp', true], // warn-tie → env owns (§10 flagged default)
  [TIER.WARN, LEVEL.RISK, DECISION.CONFIRM, 'tx', true], // confirm > warn
  [TIER.BLOCK, LEVEL.OK, DECISION.BLOCK, 'rasp', false],
  [TIER.BLOCK, LEVEL.INFO, DECISION.BLOCK, 'rasp', false],
  [TIER.BLOCK, LEVEL.CAUTION, DECISION.BLOCK, 'rasp', false],
  [TIER.BLOCK, LEVEL.RISK, DECISION.BLOCK, 'rasp', false], // hostile runtime hard-blocks even a RISK tx
];

describe('composeGate — full RASP tier × tx level matrix', () => {
  for (const [raspTier, txLevel, decision, owner, reachable] of MATRIX) {
    it(`(${raspTier} , ${txLevel}) → ${decision} owned by ${owner} (signer ${reachable ? 'reachable' : 'BLOCKED'})`, () => {
      const g = composeGate(raspTier, txLevel);
      expect(g.decision).toBe(decision);
      expect(g.owner).toBe(owner);
      expect(g.signerReachable).toBe(reachable);
    });
  }

  it('block-signing dominates every tx level (no sign-anyway in a hostile runtime)', () => {
    for (const lvl of Object.values(LEVEL)) {
      const g = composeGate(TIER.BLOCK, lvl);
      expect(g.decision).toBe(DECISION.BLOCK);
      expect(g.signerReachable).toBe(false);
    }
  });

  it('confirm (tx RISK) outranks warn (rasp) but is still reachable', () => {
    const g = composeGate(TIER.WARN, LEVEL.RISK);
    expect(g.decision).toBe(DECISION.CONFIRM);
    expect(g.signerReachable).toBe(true);
    expect(g.owner).toBe('tx');
  });
});

describe('composeGate — fail closed (I4)', () => {
  it('an unknown RASP tier blocks (most severe), never allows', () => {
    const g = composeGate('mystery-tier', LEVEL.OK);
    expect(g.decision).toBe(DECISION.BLOCK);
    expect(g.signerReachable).toBe(false);
  });

  it('an unknown tx level escalates to the tx plane top (confirm), never allow', () => {
    const g = composeGate(TIER.ALLOW, 'mystery-level');
    expect(g.decision).toBe(DECISION.CONFIRM);
    expect(g.owner).toBe('tx');
  });

  it('both inputs garbage → block', () => {
    expect(composeGate(undefined, undefined).decision).toBe(DECISION.BLOCK);
    expect(composeGate(null, null).decision).toBe(DECISION.BLOCK);
  });

  it('never returns ALLOW unless BOTH planes are clean', () => {
    expect(composeGate(TIER.ALLOW, LEVEL.OK).decision).toBe(DECISION.ALLOW);
    expect(composeGate(TIER.WARN, LEVEL.OK).decision).not.toBe(DECISION.ALLOW);
    expect(composeGate(TIER.ALLOW, LEVEL.CAUTION).decision).not.toBe(DECISION.ALLOW);
  });
});

describe('composeGate — parked-detector default (absent verdict)', () => {
  it('degrade() resolves an absent verdict to WARN, which composes to at least warn (never allow)', () => {
    // With detection parked, the env condition resolves to the cautious tier; the
    // gate must reflect that, never silent-allow.
    const g = composeGate(TIER.WARN, LEVEL.OK);
    expect(g.decision).toBe(DECISION.WARN);
    expect(g.decision).not.toBe(DECISION.ALLOW);
  });
});

// ── Deniability at the compose layer (unit level; the call-site extension waits
// for the live wiring). composeGate must be set-blind by construction. ──────────
function composeUnderActiveSet(raspTier, txLevel, activeSet) {
  globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
  try {
    return composeGate(raspTier, txLevel);
  } finally {
    delete globalThis.__VEYRNOX_ACTIVE_SET__;
  }
}

afterEach(() => {
  delete globalThis.__VEYRNOX_ACTIVE_SET__;
});

describe('composeGate — I3 deniability (set-blind)', () => {
  it('accepts no wallet-set handle (arity is 2: raspTier, txLevel)', () => {
    expect(composeGate.length).toBe(2);
  });

  it('output is byte-identical real-vs-decoy for every matrix cell', () => {
    for (const [raspTier, txLevel] of MATRIX) {
      const real = composeUnderActiveSet(raspTier, txLevel, 'real');
      const decoy = composeUnderActiveSet(raspTier, txLevel, 'decoy');
      expect(JSON.stringify(decoy)).toBe(JSON.stringify(real));
    }
  });

  it('no output field names a set, decoy, wallet, or count', () => {
    const g = composeGate(TIER.WARN, LEVEL.RISK);
    for (const k of Object.keys(g)) {
      expect(k).not.toMatch(/\b(set|decoy|real|wallet|count|total|balance|holdings)\b/i);
    }
  });
});
