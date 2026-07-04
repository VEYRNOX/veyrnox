// src/sign-gate/__tests__/presign.test.js
//
// RASP §7 live wiring — UNAUDITED-PROVISIONAL. Roadmap Phase 3.
//
// presignGate is the PURE pre-sign decision the chokepoint enforces: it composes
// the two planes (via composeGate) and adds the proceed/refuse rule the signer
// path obeys. Extracting it keeps the audit-critical logic unit-testable (the
// call site in SendCrypto.jsx is a thin caller). It is set-blind: it takes
// (raspTier, txLevel, acknowledged) and NO wallet-set handle.
//
// proceed rule (from §3 affordance table):
//   allow   → proceed (no friction)
//   warn    → proceed (the re-confirm is the EXISTING verify-step biometric, which
//             happens before this gate; warn adds no hard stop here)
//   confirm → proceed ONLY with the user's "sign anyway" acknowledgement (tx RISK)
//   block   → NEVER proceed — no override (the confirmation itself can be hooked)

import { describe, it, expect, afterEach } from 'vitest';
import { presignGate } from '../presign.js';
import { DECISION } from '../compose.js';
import { TIER } from '../../rasp/index.js';
import { LEVEL } from '../../risk/levels.js';

describe('presignGate — proceed/refuse across the matrix', () => {
  it('clean env + benign tx → allow, proceed', () => {
    const g = presignGate(TIER.ALLOW, LEVEL.OK);
    expect(g.decision).toBe(DECISION.ALLOW);
    expect(g.signerReachable).toBe(true);
    expect(g.proceedAllowed).toBe(true);
  });

  // RASP-3 (2026-07-04 internal audit, HIGH): WARN tier (e.g. rooted device) must
  // enforce an explicit user acknowledgement before proceeding — no silent pass.
  it('warn (rasp) REFUSES until acknowledged (RASP-3 friction), then proceeds', () => {
    const noAck = presignGate(TIER.WARN, LEVEL.OK, false);
    expect(noAck.decision).toBe(DECISION.WARN);
    expect(noAck.signerReachable).toBe(true);
    expect(noAck.proceedAllowed).toBe(false); // rooted device: no ack, no signing

    const acked = presignGate(TIER.WARN, LEVEL.OK, true);
    expect(acked.decision).toBe(DECISION.WARN);
    expect(acked.proceedAllowed).toBe(true);
  });

  it('warn (tx CAUTION) also refuses until acknowledged', () => {
    expect(presignGate(TIER.ALLOW, LEVEL.CAUTION, false).proceedAllowed).toBe(false);
    expect(presignGate(TIER.ALLOW, LEVEL.CAUTION, true).proceedAllowed).toBe(true);
  });

  it('only a clean PROCEED/ALLOW decision passes with no acknowledgement', () => {
    expect(presignGate(TIER.ALLOW, LEVEL.OK, false).proceedAllowed).toBe(true);
  });

  it('confirm (tx RISK) refuses until acknowledged, then proceeds', () => {
    expect(presignGate(TIER.ALLOW, LEVEL.RISK, false).proceedAllowed).toBe(false);
    expect(presignGate(TIER.ALLOW, LEVEL.RISK, true).proceedAllowed).toBe(true);
    expect(presignGate(TIER.ALLOW, LEVEL.RISK, true).decision).toBe(DECISION.CONFIRM);
  });

  it('block (rasp) NEVER proceeds — no override, even with acknowledgement', () => {
    const noAck = presignGate(TIER.BLOCK, LEVEL.OK, false);
    const acked = presignGate(TIER.BLOCK, LEVEL.RISK, true);
    expect(noAck.signerReachable).toBe(false);
    expect(noAck.proceedAllowed).toBe(false);
    expect(acked.decision).toBe(DECISION.BLOCK);
    expect(acked.proceedAllowed).toBe(false); // ack cannot override a hostile runtime
  });

  it('a hostile runtime outranks a hostile tx (block beats confirm)', () => {
    const g = presignGate(TIER.BLOCK, LEVEL.RISK, true);
    expect(g.decision).toBe(DECISION.BLOCK);
    expect(g.proceedAllowed).toBe(false);
  });
});

describe('presignGate — fail closed (I4)', () => {
  it('an unknown RASP tier blocks and refuses, never proceeds', () => {
    const g = presignGate('garbage-tier', LEVEL.OK, true);
    expect(g.decision).toBe(DECISION.BLOCK);
    expect(g.proceedAllowed).toBe(false);
  });

  it('an unknown tx level escalates to confirm — refuses without ack', () => {
    expect(presignGate(TIER.ALLOW, 'garbage-level', false).proceedAllowed).toBe(false);
    expect(presignGate(TIER.ALLOW, 'garbage-level', true).proceedAllowed).toBe(true);
  });

  it('undefined inputs block, never proceed', () => {
    expect(presignGate(undefined, undefined, true).proceedAllowed).toBe(false);
  });
});

// ── §5 call-site deniability (full-range, must bite) ─────────────────────────
function gateUnderActiveSet(raspTier, txLevel, ack, activeSet) {
  globalThis.__VEYRNOX_ACTIVE_SET__ = activeSet;
  try {
    return presignGate(raspTier, txLevel, ack);
  } finally {
    delete globalThis.__VEYRNOX_ACTIVE_SET__;
  }
}
afterEach(() => { delete globalThis.__VEYRNOX_ACTIVE_SET__; });

// Drive the FULL condition range — not just the single condition this build
// produces — so the guard protects the real behaviour before native probes land.
const FULL_RANGE = [];
for (const t of [TIER.ALLOW, TIER.WARN, TIER.BLOCK]) {
  for (const l of Object.values(LEVEL)) {
    for (const ack of [false, true]) FULL_RANGE.push([t, l, ack]);
  }
}

describe('presignGate — I3 deniability across the FULL condition range', () => {
  it('takes no wallet-set handle (arity is 2; acknowledged defaulted)', () => {
    expect(presignGate.length).toBe(2);
  });

  it('output is byte-identical real-vs-decoy for every (tier × level × ack)', () => {
    for (const [t, l, ack] of FULL_RANGE) {
      const real = gateUnderActiveSet(t, l, ack, 'real');
      const decoy = gateUnderActiveSet(t, l, ack, 'decoy');
      expect(JSON.stringify(decoy)).toBe(JSON.stringify(real));
    }
  });

  it('no output field names a set, decoy, wallet, or count', () => {
    const g = presignGate(TIER.WARN, LEVEL.RISK, true);
    for (const k of Object.keys(g)) {
      expect(k).not.toMatch(/\b(set|decoy|real|wallet|count|total|balance|holdings)\b/i);
    }
  });
});
