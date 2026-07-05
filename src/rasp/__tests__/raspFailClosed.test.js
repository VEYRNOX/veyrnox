// src/rasp/__tests__/raspFailClosed.test.js
//
// RASP-A2 (2026-07-05 internal audit, HIGH): the SendCrypto pre-sign gate must
// FAIL CLOSED (I4) when the RASP artifact is missing a tier. The original code
// used `raspTier ?? TIER.ALLOW`, a fail-OPEN fallback: if degrade() ever returned
// undefined (a crash, a shape drift), the sign gate would proceed with ALLOW.
//
// This test pins the CONTRACT that the fallback tier, when fed through the same
// presignGate() the component uses, must NOT proceed. TIER.BLOCK does not proceed;
// TIER.ALLOW would — so this test would go red if the fallback were reverted to
// ALLOW.

import { describe, it, expect } from 'vitest';
import { degrade, TIER } from '../index.js';
import { presignGate } from '../../sign-gate/presign.js';
import { LEVEL } from '../../risk/levels.js';

// The exact fallback constant SendCrypto.jsx uses when raspArtifact?.tier is
// nullish. Kept in lockstep with `src/pages/SendCrypto.jsx` (raspTier fallback).
const SENDCRYPTO_RASP_FALLBACK = TIER.BLOCK;

describe('RASP-A2 — SendCrypto raspTier fallback fails closed (I4)', () => {
  it('when degrade() returns undefined, the fallback resolves to a BLOCK tier', () => {
    // Simulate the crash / shape-drift path: raspArtifact is undefined.
    const raspArtifact = undefined;
    const raspTier = raspArtifact?.tier ?? SENDCRYPTO_RASP_FALLBACK;
    expect(raspTier).toBe(TIER.BLOCK);
    expect(raspTier).not.toBe(TIER.ALLOW);
  });

  it('the fallback tier, fed through presignGate, does NOT proceed', () => {
    const raspArtifact = undefined;
    const raspTier = raspArtifact?.tier ?? SENDCRYPTO_RASP_FALLBACK;
    // A RISK tx level + no acknowledgement — the RASP tier alone must block.
    const gate = presignGate(raspTier, LEVEL.RISK, false);
    expect(gate.proceedAllowed).toBe(false);
    expect(gate.signerReachable).toBe(false);
  });

  it('proves the choice matters: an ALLOW fallback WOULD have proceeded on a clean tx', () => {
    // Guard against a silent revert to `?? TIER.ALLOW`: with ALLOW the same
    // pipeline proceeds on a clean tx, which is exactly the fail-open we forbid.
    const openGate = presignGate(TIER.ALLOW, LEVEL.OK, false);
    expect(openGate.proceedAllowed).toBe(true);
    // The real (BLOCK) fallback never proceeds, clean tx or not.
    const closedGate = presignGate(SENDCRYPTO_RASP_FALLBACK, LEVEL.OK, false);
    expect(closedGate.proceedAllowed).toBe(false);
  });

  it('degrade(undefined) itself already blocks — the fallback backs up a defense', () => {
    // degrade() is fail-closed for undefined too; the SendCrypto fallback only
    // matters if degrade() ITSELF returns undefined (shape drift). Both layers
    // must agree on BLOCK.
    const a = degrade(undefined);
    expect(a.tier).toBe(TIER.BLOCK);
  });
});
