// src/rasp/__tests__/attestation-latch.test.js
//
// Codex P2 2026-08-16 — session-scoped attestation latch. Once
// attestationFailed:true is observed within a session, subsequent probes
// that would otherwise return UNAVAILABLE (timeout, throw, malformed
// verdict) INHERIT the fail. Only a fresh attestationFailed:false clears
// it. This prevents a "block once, warn forever" oracle where an attacker
// suppresses attestation responses to flip a BLOCK to WARN on the next
// presign.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attestationProbeSource, _resetAttestationLatchForTests } from '../attestation.js';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

describe('attestationProbeSource — session latch (Codex P2 2026-08-16)', () => {
  beforeEach(() => {
    _resetAttestationLatchForTests();
  });

  it('a fresh attestationFailed:true latches: next UNAVAILABLE probe inherits the fail', async () => {
    const fail = await attestationProbeSource(async () => ({ available: true, attestationFailed: true }));
    expect(fail).toEqual({ available: true, attestationFailed: true });

    // Subsequent probe that throws — WITHOUT the latch this would return
    // UNAVAILABLE (available:false), downgrading BLOCK → WARN. WITH the
    // latch, it inherits the prior fail.
    const muted = await attestationProbeSource(async () => { throw new Error('bridge muted'); });
    expect(muted).toEqual({ available: true, attestationFailed: true });
  });

  it('a fresh attestationFailed:false CLEARS the latch (only a real PASS clears)', async () => {
    // Prime the latch with a fail.
    await attestationProbeSource(async () => ({ available: true, attestationFailed: true }));
    // A fresh, well-formed, PASSED verdict clears it.
    const pass = await attestationProbeSource(async () => ({ available: true, attestationFailed: false }));
    expect(pass).toEqual({ available: true, attestationFailed: false });
    // Subsequent throw now returns UNAVAILABLE (latch is off).
    const muted = await attestationProbeSource(async () => { throw new Error('bridge muted'); });
    expect(muted.available).toBe(false);
  });

  it('partial-shape verdict inherits the latch too', async () => {
    await attestationProbeSource(async () => ({ available: true, attestationFailed: true }));
    // Garbage bridge response — attestationFailed not a boolean.
    const bad = await attestationProbeSource(async () => ({ available: true }));
    expect(bad).toEqual({ available: true, attestationFailed: true });
  });

  it('with no prior fail, throw returns UNAVAILABLE (no latch to inherit)', async () => {
    const muted = await attestationProbeSource(async () => { throw new Error('bridge muted'); });
    expect(muted.available).toBe(false);
  });
});
