// src/rasp/__tests__/g2-wiring.test.js
//
// G2 remote-attestation wiring — STRUCTURAL SOURCE-PIN tests.
//
// These pin the fact that the two pre-sign gate callsites (useRaspArtifact.js and
// SendCrypto.jsx) actually compose the remote-attestation leg into the RASP verdict
// via the attestation.js API (attestationProbeSource / detectAttestation /
// composeConditions). They read the source files and assert on literal presence —
// they cannot pass until the wiring is landed. Behavioural/fail-closed semantics are
// covered by attestation.test.js (the 21 unit tests); this file only guards the wiring.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const useRaspSrc = readFileSync(resolve(repoRoot, 'src/rasp/useRaspArtifact.js'), 'utf8');
const sendCryptoSrc = readFileSync(resolve(repoRoot, 'src/pages/SendCrypto.jsx'), 'utf8');

describe('G2 wiring — useRaspArtifact.js composes the attestation leg', () => {
  it('imports attestationProbeSource from ./attestation.js', () => {
    expect(useRaspSrc).toContain('attestationProbeSource');
    expect(useRaspSrc).toMatch(/from ['"]\.\/attestation\.js['"]/);
  });

  it('imports detectAttestation', () => {
    expect(useRaspSrc).toContain('detectAttestation');
  });

  it('imports composeConditions', () => {
    expect(useRaspSrc).toContain('composeConditions');
  });

  it('calls attestationProbeSource()', () => {
    expect(useRaspSrc).toContain('attestationProbeSource()');
  });

  it('calls detectAttestation(attestationResult)', () => {
    expect(useRaspSrc).toContain('detectAttestation(attestationResult)');
  });

  it('calls composeConditions(', () => {
    expect(useRaspSrc).toContain('composeConditions(');
  });
});

describe('G2 wiring — SendCrypto.jsx composes the attestation leg', () => {
  // P2-7 (audit 2026-07-15): SendCrypto no longer duplicates the OS/attestation
  // probe-sampling effects inline — it now delegates to useRaspArtifact() (which
  // pins the same attestation composition above) and, on the sign hot-path,
  // awaits getFreshRaspArtifact() (which pins it in src/rasp/getFreshRaspArtifact.js).
  // The attestation leg is therefore still composed for the Send flow, but via
  // shared code rather than an inline duplicate.
  it('routes RASP through useRaspArtifact (the hook that composes the attestation leg)', () => {
    expect(sendCryptoSrc).toContain('useRaspArtifact');
  });

  it('awaits getFreshRaspArtifact on the sign hot-path (composes fresh attestation at sign)', () => {
    expect(sendCryptoSrc).toContain('getFreshRaspArtifact');
  });
});
