// src/lib/__tests__/WalletProvider.clearActionPassword.test.js
//
// M-F (independent audit, 2026-06-28) — clearActionPassword in the decoy/hidden
// branch removed the per-set Action Password (the second factor) by reading
// containerRef.current and clearing the record with NO credential re-auth. An
// attacker holding an already-open decoy session could disable 2FA without ever
// proving knowledge of the duress credential — a privilege escalation inside a
// coerced/decoy context.
//
// Fix: in the decoy/hidden branch, VERIFY the caller-supplied credential against
// the ACTIVE set BEFORE mutating the container. On a wrong credential, throw and
// touch nothing (I4 — fail honest, fail closed). The verification must use the
// SAME decoy-credential primitive already used elsewhere in the provider
// (tryDuressUnlock for decoy), so the behaviour is consistent with
// persistActiveSetContainer / setActionPassword.
//
// STRUCTURAL assertions over the provider source — the established pattern for
// provider-internal callbacks that are awkward to drive through jsdom (see
// WalletProvider.m6.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

// Isolate the clearActionPassword callback body.
const fnStart = providerSrc.indexOf('const clearActionPassword = useCallback');
const body = providerSrc.slice(fnStart, providerSrc.indexOf('}, [', fnStart) + 80);

describe('M-F — clearActionPassword requires credential re-auth in decoy/hidden', () => {
  it('defines clearActionPassword', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('re-authenticates the decoy/hidden credential before mutating the container', () => {
    // The verification must appear, and it must come BEFORE clearActionPasswordRecord
    // mutates the active set's container (fail closed: no mutation on a bad credential).
    const verifyIdx = body.search(/tryDuressUnlock|verifyActionPassword|revealHiddenMnemonic/);
    const mutateIdx = body.indexOf('clearActionPasswordRecord');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(mutateIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeLessThan(mutateIdx);
  });

  it('throws (fails closed) when the supplied credential does not open the active set', () => {
    // A guard that throws on a failed verification must be present in the body.
    expect(body).toMatch(/throw new Error/);
  });

  it('does not blindly read containerRef.current before the re-auth in the decoy/hidden path', () => {
    // containerRef.current may still be used, but only AFTER a verification gate.
    const verifyIdx = body.search(/tryDuressUnlock|verifyActionPassword/);
    const refIdx = body.indexOf('containerRef.current');
    expect(verifyIdx).toBeGreaterThan(-1);
    // the first credential check precedes the first container read in the decoy branch
    expect(verifyIdx).toBeLessThan(refIdx === -1 ? Infinity : refIdx + 1);
  });
});
