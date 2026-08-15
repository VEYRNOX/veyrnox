// Branch review 2026-08-15 (S-1) — regression cover for the cloned-authenticator
// POLICY REVERSAL, which shipped with none.
//
// The M-K posture was "advisory, not a hard block": runPasskeyGate returned
// PASSED with a structured `warning`, and unlock proceeded. That was reversed to
// a hard block (throw), on the reasoning that a synced/backed-up/cloned private
// key can still produce a userVerification-passing assertion, so UV satisfied is
// not credential authenticity.
//
// Neither direction of that reversal was pinned by a test. src/lib/__tests__/
// passkey.test.js covers verifyPasskeyAssertion THROWING PasskeyClonedError —
// the library layer, untouched by the change — and nothing covered the gate's
// response to it. A silent revert to advisory would have gone unnoticed, which
// is exactly how the same area shipped an unreachable warning branch (C-2).
//
// runPasskeyGate is a provider-internal useCallback, so the gate's own wiring is
// asserted structurally (the pattern used by WalletProvider.decoyReferral.test.js
// and WalletProvider.m6.test.js). The message contract underneath it is a plain
// exported map and is tested behaviourally.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PasskeyGateError,
  PasskeyClonedError,
  isPasskeyClonedError,
  isPasskeyGateError,
  PASSKEY_GATE_MESSAGES,
} from '../passkey.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const providerSrc = stripComments(read('../WalletProvider.jsx'));
const walletEntrySrc = stripComments(read('../../components/WalletEntry.jsx'));
const hdManagerSrc = stripComments(read('../../pages/HDWalletManager.jsx'));

describe('runPasskeyGate — clone detection BLOCKS (the M-K reversal)', () => {
  it('throws a PasskeyGateError with reason "cloned" on clone detection', () => {
    expect(providerSrc).toMatch(
      /if\s*\(\s*isPasskeyClonedError\(\s*err\s*\)\s*\)\s*\{\s*throw new PasskeyGateError\(\s*'cloned'\s*,\s*err\s*\)\s*;?\s*\}/,
    );
  });

  it('does NOT return PASSED with a warning for the clone case', () => {
    // The precise shape being reverted. If this ever matches again the gate has
    // gone back to advisory, and the block above is decoration.
    expect(providerSrc).not.toMatch(/status:\s*PASSKEY_GATE\.PASSED\s*,\s*warning:/);
    expect(providerSrc).not.toMatch(/authenticator_cloned/);
  });

  it('the clone check runs BEFORE the generic classify-and-throw', () => {
    // classifyPasskeyError has no 'cloned' branch, so a clone reaching it first
    // would be reported as a generic 'error' and lose the signal entirely.
    const cloneIdx = providerSrc.search(/isPasskeyClonedError\(\s*err\s*\)/);
    const genericIdx = providerSrc.search(/throw new PasskeyGateError\(\s*classifyPasskeyError/);
    expect(cloneIdx).toBeGreaterThan(-1);
    expect(genericIdx).toBeGreaterThan(-1);
    expect(cloneIdx).toBeLessThan(genericIdx);
  });

  it('unlock() no longer returns a permanently-null passkeyWarning field', () => {
    // C-2: a null-forever field on a security return shape reads as a supported
    // signal a caller may branch on, and answers "no warning" for all time.
    expect(providerSrc).not.toMatch(/passkeyWarning/);
  });
});

describe('PASSKEY_GATE_MESSAGES — one map, no per-screen ternaries', () => {
  it('covers every reason the gate can throw', () => {
    for (const reason of ['cancelled', 'error', 'cloned']) {
      expect(PASSKEY_GATE_MESSAGES[reason], `${reason} needs copy`).toBeTruthy();
    }
  });

  it('the cloned message names the counter signal and the re-register action', () => {
    const m = PASSKEY_GATE_MESSAGES.cloned.toLowerCase();
    expect(m).toMatch(/counter/);
    expect(m).toMatch(/copied to another device/);
    expect(m).toMatch(/re-register/);
  });

  it('the cloned message does NOT claim the passkey was removed from the device', () => {
    // The actual C-1 defect: a possible credential clone was reported as a
    // passkey that "may have been removed from this device", which reads as
    // benign on the one screen where the user most needs to stop.
    expect(PASSKEY_GATE_MESSAGES.cloned.toLowerCase()).not.toMatch(/may have been removed/);
  });

  it('cloned copy is distinct from both other reasons', () => {
    expect(PASSKEY_GATE_MESSAGES.cloned).not.toBe(PASSKEY_GATE_MESSAGES.error);
    expect(PASSKEY_GATE_MESSAGES.cloned).not.toBe(PASSKEY_GATE_MESSAGES.cancelled);
  });

  it('both unlock screens render the map instead of a cancelled-vs-else ternary', () => {
    for (const [name, src] of [['WalletEntry', walletEntrySrc], ['HDWalletManager', hdManagerSrc]]) {
      expect(src, `${name} should read the shared map`).toMatch(
        /setError\(\s*PASSKEY_GATE_MESSAGES\[\s*e\.reason\s*\]/,
      );
      expect(src, `${name} should not re-introduce the ternary`).not.toMatch(
        /e\.reason === "cancelled"\s*\?/,
      );
    }
  });

  it('WalletEntry no longer carries the unreachable advisory toast', () => {
    // C-2: it could never fire once passkeyWarning became null, so it was dead
    // code that read as live coverage of the clone case.
    expect(walletEntrySrc).not.toMatch(/passkeyWarning\?\.code/);
  });
});

describe('PasskeyGateError — the cloned reason is a first-class one', () => {
  it('carries a cloned-specific message, not the generic fallback', () => {
    const e = new PasskeyGateError('cloned', new PasskeyClonedError(7, 7));
    expect(e.reason).toBe('cloned');
    expect(e.message).toBe(PASSKEY_GATE_MESSAGES.cloned);
    expect(e.message).not.toBe(PASSKEY_GATE_MESSAGES.error);
    expect(isPasskeyGateError(e)).toBe(true);
  });

  it('preserves the underlying counters as cause, for diagnostics', () => {
    const cause = new PasskeyClonedError(12, 9);
    const e = new PasskeyGateError('cloned', cause);
    expect(isPasskeyClonedError(e.cause)).toBe(true);
    expect(e.cause.oldSignCount).toBe(12);
    expect(e.cause.newSignCount).toBe(9);
  });

  it('still maps the two original reasons correctly', () => {
    expect(new PasskeyGateError('cancelled').message).toBe(PASSKEY_GATE_MESSAGES.cancelled);
    expect(new PasskeyGateError('error').message).toBe(PASSKEY_GATE_MESSAGES.error);
  });

  it('an unknown reason falls back to the generic message rather than undefined', () => {
    // Fail-closed on copy: a future reason with no entry must not render
    // "undefined" into the unlock screen's alert region.
    // @ts-expect-error deliberately outside the declared union
    expect(new PasskeyGateError('something-new').message).toBe(PASSKEY_GATE_MESSAGES.error);
  });
});

describe('the password-only escape hatch stays reachable for a cloned passkey', () => {
  it('both screens set passkeyFailed for EVERY gate reason, not just some', () => {
    // Blocking must not brick access: a false positive (device restore, iCloud
    // or Google Passwords sync) has to keep the SAST-M-3 escape hatch available.
    // The hatch renders on `passkeyFailed` being truthy, so the assignment must
    // stay unconditional inside the isPasskeyGateError branch.
    for (const [name, src] of [['WalletEntry', walletEntrySrc], ['HDWalletManager', hdManagerSrc]]) {
      const idx = src.search(/if\s*\(\s*isPasskeyGateError\(\s*e\s*\)\s*\)\s*\{/);
      expect(idx, `${name} should classify gate errors`).toBeGreaterThan(-1);
      const branch = src.slice(idx, idx + 500);
      expect(branch, `${name} must set passkeyFailed unconditionally`).toMatch(
        /setPasskeyFailed\(\s*\{\s*reason:\s*e\.reason\s*\}\s*\)/,
      );
      expect(branch, `${name} must not gate the hatch on the reason`).not.toMatch(
        /if\s*\(\s*e\.reason\s*[!=]==?\s*['"]cloned['"]\s*\)/,
      );
    }
  });
});
