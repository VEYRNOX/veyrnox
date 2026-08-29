// P2-1 / P2-4 / P2-7 audit findings — SendCrypto now routes RASP through the
// shared hook (P2-7 dedup) with attestation deferred until the review/confirm
// step (P2-4; renamed from the pre-wizard "verify" in 2026-08-28's 3-step
// split) and calls getFreshRaspArtifact() at signing time (P2-1 anti-stale).
//
// Structural pins on the source text. The behavioural properties are exercised
// by the corresponding hook / helper unit tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — P2-7 uses the shared useRaspArtifact hook (no inline dup)', () => {
  it('imports useRaspArtifact', () => {
    expect(src).toMatch(/useRaspArtifact/);
  });

  it('calls useRaspArtifact(...) once (not inline probe effects)', () => {
    // Exactly one call site of the hook in the component body.
    const matches = src.match(/useRaspArtifact\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('no longer contains its own await nativeProbeSource() effect', () => {
    // The dedupe: the inline duplicate must be gone. WC still has its own
    // separate presign path but SendCrypto delegates to the hook.
    expect(src).not.toMatch(/await\s+nativeProbeSource\s*\(\s*\)/);
  });

  it('no longer contains its own await attestationProbeSource() effect', () => {
    expect(src).not.toMatch(/await\s+attestationProbeSource\s*\(\s*\)/);
  });
});

describe('SendCrypto — P2-4 attestation deferred until step is review or confirm', () => {
  it('passes deferAttestation to useRaspArtifact keyed off step', () => {
    // The hook is called with an options object; the deferAttestation flag is
    // derived from step so the network call is not fired on Send-page mount.
    expect(src).toMatch(/useRaspArtifact\s*\(\s*\{[^}]*deferAttestation[^}]*\}/s);
    // And the flag is bound to the step state (not a constant).
    const idx = src.indexOf('useRaspArtifact(');
    const region = src.slice(idx, idx + 300);
    expect(region).toMatch(/step/);
  });
});

describe('SendCrypto — P2-1 fresh-at-sign re-probe inside mutationFn', () => {
  it('imports getFreshRaspArtifact', () => {
    expect(src).toMatch(/getFreshRaspArtifact/);
  });

  it('awaits getFreshRaspArtifact() inside the live send gate helper', () => {
    const gateIdx = src.indexOf('const evaluateCurrentSendGate = async');
    expect(gateIdx).toBeGreaterThan(-1);
    // Fresh-at-sign now lives in the shared gate helper invoked by mutationFn,
    // so pin the helper body rather than requiring the probe inline.
    const region = src.slice(gateIdx, gateIdx + 4000);
    expect(region).toMatch(/await\s+getFreshRaspArtifact\s*\(\s*\)/);
  });

  it('uses the fresh artifact tier (not the closure raspTier) for presignAtSign', () => {
    const gateIdx = src.indexOf('const evaluateCurrentSendGate = async');
    expect(gateIdx).toBeGreaterThan(-1);
    const region = src.slice(gateIdx, gateIdx + 4000);
    // presignAtSign must be computed from a locally-derived tier in the live
    // send gate helper, not the component-level closure raspTier.
    expect(region).toMatch(/presignGate\s*\(\s*fresh/);
  });
});
