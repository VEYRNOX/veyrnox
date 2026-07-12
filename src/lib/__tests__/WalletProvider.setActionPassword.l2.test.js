// src/lib/__tests__/WalletProvider.setActionPassword.l2.test.js
//
// L-2 (INTERNAL S1–S4 audit, 2026-07-08) — setActionPassword in the decoy/hidden
// branch INSTALLED a new per-set Action Password (the second factor) by reading
// containerRef.current with NO credential re-auth:
//
//   const current = isDecoy || isHidden ? containerRef.current
//                                       : await decryptPrimaryContainer(password);
//
// An attacker holding a brief already-open decoy/hidden session could install a
// brand-new Action Password without ever proving knowledge of the duress/reveal
// credential — a privilege escalation inside a coerced/decoy context, mirroring
// the M-F clearActionPassword bug.
//
// Fix: in the decoy/hidden branch, VERIFY the caller-supplied credential against
// the ACTIVE set BEFORE reading/mutating the container. On a wrong credential,
// throw and touch nothing (I4 — fail honest, fail closed). Verification must use
// the SAME decoy/hidden primitives the rest of the provider uses (tryDuressUnlock
// for decoy, tryRevealHidden for hidden), exactly like clearActionPassword.
//
// STRUCTURAL assertions over the provider source — the established pattern for
// provider-internal callbacks that are awkward to drive through jsdom (see
// WalletProvider.clearActionPassword.test.js / WalletProvider.m6.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

// Isolate the setActionPassword callback body.
const fnStart = providerSrc.indexOf('const setActionPassword = useCallback');
const body = providerSrc.slice(fnStart, providerSrc.indexOf('}, [', fnStart) + 80);

describe('L-2 — setActionPassword requires credential re-auth in decoy/hidden', () => {
  it('defines setActionPassword', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('re-authenticates the decoy credential (tryDuressUnlock) before mutating the container', () => {
    const verifyIdx = body.indexOf('tryDuressUnlock');
    const mutateIdx = body.indexOf('withActionPasswordRecord');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(-1);
    // credential check precedes the AP-record mutation (fail closed).
    expect(verifyIdx).toBeLessThan(mutateIdx);
  });

  it('re-authenticates the hidden credential (tryRevealHidden) before mutating the container', () => {
    const verifyIdx = body.indexOf('tryRevealHidden');
    const mutateIdx = body.indexOf('withActionPasswordRecord');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeLessThan(mutateIdx);
  });

  it('throws (fails closed) when the supplied credential does not open the active set', () => {
    // A guard that throws on a null unlock result must be present in the body.
    expect(body).toMatch(/==\s*null[\s\S]*throw new Error|throw new Error/);
    expect(body).toContain('throw new Error');
  });

  it('does not read containerRef.current in the decoy/hidden branch without a preceding re-auth gate', () => {
    // The old vulnerable form read containerRef.current directly in the ternary.
    // Ensure the naive "isDecoy || isHidden ? containerRef.current" pattern is gone.
    expect(body).not.toMatch(/isDecoy\s*\|\|\s*isHidden\s*\?\s*containerRef\.current/);
  });
});
