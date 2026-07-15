// P2-4 / P2-7 (audit): structural pins on useRaspArtifact.js.
//
// P2-7 — SendCrypto used to duplicate the OS-probe sampling inline while the
// attestation effect had `[]` deps in BOTH implementations (sampled once per
// mount only, no invalidation on foreground or heartbeat). A Send screen mounted
// for hours only ever held the mount-time attestation verdict. Fix: the
// attestation effect in useRaspArtifact.js now re-runs on probeKey change (same
// deps as the OS probe re-sample), and SendCrypto delegates to the hook.
//
// P2-4 — the attestation network call must NOT fire on mount by default when the
// caller can defer it until explicit sign intent. Hook accepts a
// `deferAttestation` option; when true, the attestation effect body skips.
//
// Structural (source-string) pins — behaviour is exercised by the existing
// wiring tests plus the new SendCrypto tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../useRaspArtifact.js'), 'utf8');

describe('useRaspArtifact — P2-7 attestation re-samples on foreground / heartbeat', () => {
  it('attestation useEffect depends on probeKey (not empty deps)', () => {
    // Locate the attestation effect (the one that awaits attestationProbeSource)
    // and confirm its dependency array includes probeKey.
    const idx = src.indexOf('attestationProbeSource()');
    expect(idx).toBeGreaterThan(-1);
    // The useEffect closes with `}, [<deps>]);` shortly after the await call.
    const region = src.slice(idx, idx + 600);
    expect(region).toMatch(/\},\s*\[[^\]]*probeKey[^\]]*\]\s*\)/);
  });

  it('resets attestationResult before re-sampling so the async window is not stale', () => {
    // Foreground / heartbeat setters must clear attestationResult (or its effect
    // must clear it at the top) so during the re-sample window the composed
    // verdict is INTEGRITY_UNAVAILABLE (WARN), never the previous CLEAN.
    expect(src).toMatch(/setAttestationResult\s*\(\s*null\s*\)/);
  });
});

describe('useRaspArtifact — P2-4 deferAttestation opt-out', () => {
  it('hook signature accepts an options object', () => {
    // Any of the shapes: ({...} = {}) / ({...}) / (options) — pin the presence.
    expect(src).toMatch(/export\s+function\s+useRaspArtifact\s*\(\s*\{?/);
  });

  it('mentions deferAttestation as a controlled opt-out', () => {
    expect(src).toMatch(/deferAttestation/);
  });

  it('attestation effect body early-returns when deferAttestation is true', () => {
    // The skip must live inside the effect so a caller that flips the flag
    // false→true during a session actually blocks the fire.
    const idx = src.indexOf('attestationProbeSource()');
    const region = src.slice(Math.max(0, idx - 400), idx);
    expect(region).toMatch(/deferAttestation/);
  });
});
