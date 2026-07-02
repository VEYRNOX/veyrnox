// Tests for the pure send-time 2FA method resolver. This pins the EXACT rule the
// Send screen uses to pick the second factor — and it is the regression guard for
// audit finding H-1: a passkey-only 2FA configuration MUST resolve to 'passkey',
// not be silently skipped because no Action Password is configured.
//
// The decision mirrors useActionGuard.resolveMethod but is extracted as a pure
// function of three booleans so it is exhaustively unit-testable and the enforced
// rule cannot drift from the gate the UI shows. Codes are the contract.
import { describe, it, expect } from 'vitest';
import { resolveSend2faMethod, SEND_2FA } from '@/lib/send2faMethod';

describe('resolveSend2faMethod — the send-time second-factor resolver (audit H-1)', () => {
  it('resolves PASSKEY when passkey 2FA is enabled AND a passkey is registered', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.PASSKEY);
  });

  it('REGRESSION H-1: passkey-only (no Action Password) still requires a second factor', () => {
    // This is the exact bug: actionPasswordConfigured is false for passkey-only,
    // and the old code keyed solely off that — so the gate was skipped. The method
    // must be PASSKEY (not NONE) so a second factor is actually applied.
    const method = resolveSend2faMethod({
      demo: false,
      passkey2faEnabled: true,
      passkeyRegistered: true,
      actionPasswordConfigured: false,
    });
    expect(method).not.toBe(SEND_2FA.NONE);
    expect(method).toBe(SEND_2FA.PASSKEY);
  });

  it('passkey wins over password when BOTH are configured', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.PASSKEY);
  });

  it('resolves PASSWORD when only an Action Password is configured', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: false,
        passkeyRegistered: false,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.PASSWORD);
  });

  it('resolves NONE when no second factor is configured (opt-in, unchanged behaviour)', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: false,
        passkeyRegistered: false,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('a passkey 2FA preference with NO registered passkey does NOT resolve to passkey', () => {
    // Pref on but nothing registered: cannot honestly run a passkey assertion, so
    // it must fall through to whatever else is configured (here: password).
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: true,
        passkeyRegistered: false,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.PASSWORD);
    // ...and NONE when nothing else is configured.
    expect(
      resolveSend2faMethod({
        demo: false,
        passkey2faEnabled: true,
        passkeyRegistered: false,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('resolves BIOMETRIC on native when the OS-biometric 2FA factor is enabled', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isNative: true,
        biometric2faEnabled: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.BIOMETRIC);
  });

  it('biometric wins over passkey AND password on native (it is the genuine, working possession factor)', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isNative: true,
        biometric2faEnabled: true,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.BIOMETRIC);
  });

  it('biometric 2FA enabled but NOT native does NOT resolve to biometric (web has no OS biometric)', () => {
    // On web the OS biometric cannot run, so a stale/cross-device pref must fall
    // through to whatever else is configured rather than gate on an absent factor.
    expect(
      resolveSend2faMethod({
        demo: false,
        isNative: false,
        biometric2faEnabled: true,
        passkeyRegistered: true,
        passkey2faEnabled: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.PASSKEY);
    expect(
      resolveSend2faMethod({
        demo: false,
        isNative: false,
        biometric2faEnabled: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('DEMO short-circuits to NONE regardless of any configured factor (fake sends, no vault)', () => {
    expect(
      resolveSend2faMethod({
        demo: true,
        isNative: true,
        biometric2faEnabled: true,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('FAILS SAFE on missing inputs: undefined args resolve to NONE, not a half-applied gate', () => {
    expect(resolveSend2faMethod()).toBe(SEND_2FA.NONE);
    expect(resolveSend2faMethod({})).toBe(SEND_2FA.NONE);
  });
});

describe('resolveSend2faMethod — decoy/hidden suppression of device-global factors (I3 deniability)', () => {
  // The passkey and biometric 2FA factors are DEVICE-GLOBAL (single localStorage
  // prefs), not per-set. A decoy/hidden session is never told the real session's
  // factors; if it fired a real-session passkey/biometric challenge it would (a) leak
  // real-session state and (b) for an RP-backed passkey risk a network round-trip
  // inside a session that must make zero backend calls (I3). So in a decoy OR hidden
  // session those global factors are SUPPRESSED (treated as disabled). The PER-SET
  // Action Password is unaffected — the active set carries its own AP record.

  it('decoy session suppresses a passkey-only global factor → NONE (was PASSKEY)', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isDecoy: true,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('hidden session suppresses a native biometric-only global factor → NONE (was BIOMETRIC)', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isHidden: true,
        isNative: true,
        biometric2faEnabled: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.NONE);
  });

  it('decoy session PRESERVES the per-set Action Password factor → PASSWORD', () => {
    // Action Password is per-set (deniability-safe), so it must still gate.
    expect(
      resolveSend2faMethod({
        demo: false,
        isDecoy: true,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.PASSWORD);
  });

  it('hidden session with only Action Password still resolves to PASSWORD', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isHidden: true,
        actionPasswordConfigured: true,
      }),
    ).toBe(SEND_2FA.PASSWORD);
  });

  it('NO REGRESSION: a normal session (isDecoy=false,isHidden=false) still resolves PASSKEY', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isDecoy: false,
        isHidden: false,
        passkey2faEnabled: true,
        passkeyRegistered: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.PASSKEY);
  });

  it('NO REGRESSION: a normal session still resolves BIOMETRIC on native', () => {
    expect(
      resolveSend2faMethod({
        demo: false,
        isDecoy: false,
        isHidden: false,
        isNative: true,
        biometric2faEnabled: true,
        actionPasswordConfigured: false,
      }),
    ).toBe(SEND_2FA.BIOMETRIC);
  });
});
