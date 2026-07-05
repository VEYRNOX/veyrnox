// Tests for lib/passkey.js's PURE settings-surface helpers (no DOM, no plugin):
//
//   • canSetPasskeyUnlock — the "require on unlock" toggle may only be switched
//     ON once a registration/enrollment exists. WalletProvider.runPasskeyGate()
//     SKIPS the gate when nothing is registered, so an enabled-but-unregistered
//     preference is FAIL-OPEN — the UI would show a gate that silently never
//     runs (fake security). The helper refuses that state; turning OFF is
//     always allowed.
//
//   • isRegistrationCancel — the quiet "user dismissed the OS sheet" signal is
//     platform-scoped: web reports NotAllowedError; the native biometric plugin
//     reports code 'userCancel' and NEVER NotAllowedError. Treating
//     NotAllowedError as a cancel ON NATIVE is exactly the bug that made
//     Register silently do nothing (the WebView's dead WebAuthn stub throws it).

import { describe, it, expect } from 'vitest';
import { canSetPasskeyUnlock, isRegistrationCancel } from '@/lib/passkey';

describe('canSetPasskeyUnlock — toggle requires a registration (fail-open guard)', () => {
  it('refuses to enable when nothing is registered (would be a fake gate)', () => {
    expect(canSetPasskeyUnlock({ requestedOn: true, registered: false })).toBe(false);
  });

  it('allows enabling once a credential/enrollment exists', () => {
    expect(canSetPasskeyUnlock({ requestedOn: true, registered: true })).toBe(true);
  });

  it('always allows turning OFF, registered or not', () => {
    expect(canSetPasskeyUnlock({ requestedOn: false, registered: false })).toBe(true);
    expect(canSetPasskeyUnlock({ requestedOn: false, registered: true })).toBe(true);
  });

  it('treats a missing/falsy registered flag as unregistered (fail closed)', () => {
    expect(canSetPasskeyUnlock({ requestedOn: true, registered: undefined })).toBe(false);
    expect(canSetPasskeyUnlock({ requestedOn: true, registered: null })).toBe(false);
  });
});

describe('isRegistrationCancel — platform-scoped cancel classification', () => {
  it('web: NotAllowedError is the user-cancel signal', () => {
    const err = new Error('dismissed');
    err.name = 'NotAllowedError';
    expect(isRegistrationCancel(err, false)).toBe(true);
  });

  it('web: any other error is NOT a cancel (must be surfaced)', () => {
    expect(isRegistrationCancel(new Error('boom'), false)).toBe(false);
    expect(isRegistrationCancel(null, false)).toBe(false);
  });

  it('native: the biometric plugin\'s userCancel code is the cancel signal', () => {
    const err = new Error('cancelled');
    err.code = 'userCancel';
    expect(isRegistrationCancel(err, true)).toBe(true);
    // Some plugin versions carry it in the message instead.
    expect(isRegistrationCancel(new Error('userCancel'), true)).toBe(true);
  });

  it('native: NotAllowedError is NOT a cancel — it means the dead WebAuthn stub ran (surface it, I4)', () => {
    const err = new Error('The operation is not allowed');
    err.name = 'NotAllowedError';
    expect(isRegistrationCancel(err, true)).toBe(false);
  });

  it('native: other biometric failures (lockout, no match) are NOT cancels', () => {
    const lockout = new Error('too many attempts');
    lockout.code = 'biometryLockout';
    expect(isRegistrationCancel(lockout, true)).toBe(false);
    expect(isRegistrationCancel(null, true)).toBe(false);
  });
});
