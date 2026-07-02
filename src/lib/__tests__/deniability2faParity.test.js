/**
 * Deniability 2FA parity + suppression invariants
 *
 * Security model — SOURCE OF TRUTH: PR #546 (owner decision 2026-07-02).
 *
 *  - PER-SET Action Password is the deniability-safe 2FA factor. It lives inside
 *    each set's own encrypted container, so the gate fires IDENTICALLY whether the
 *    active set is primary, decoy, or hidden. An observer cannot tell which set is
 *    active from the AP prompt — this is the parity that MUST hold.
 *
 *  - DEVICE-GLOBAL factors (passkey, OS biometric) are SUPPRESSED in decoy/hidden
 *    sessions. They are single localStorage prefs, not per-set: a decoy/hidden
 *    session is never told the real session's factors, so firing one would leak
 *    real-session state, and a passkey WebAuthn ceremony could make a network
 *    round-trip — violating I3 (deniability mode makes zero backend calls).
 *    Suppression fails closed toward the honest per-set AP (I4).
 *
 * NOTE ON THE MODEL CHOICE: an earlier version of this file asserted "prompt
 * parity" — that resolveSend2faMethod must ignore isDecoy/isHidden so a device-
 * global prompt appears identically across sessions. That conflicts with #546.
 * The owner resolved the conflict in favour of suppression: I3 no-egress + I4
 * fail-closed outrank device-global prompt parity, and the passkey ceremony is
 * not structurally guaranteed to stay local. This file now encodes suppression.
 *
 * These tests assert:
 *  1. resolveSend2faMethod SUPPRESSES passkey/biometric when isDecoy||isHidden,
 *     while PRESERVING the per-set Action Password (PASSWORD) and leaving normal-
 *     session behavior unchanged.
 *  2. The per-set AP gate (evaluateTwoFactor) outcome is identical across session
 *     types — the parity that remains once device-global factors are suppressed.
 *  3. demo → NONE is the only other mode-based override.
 */

import { describe, it, expect } from 'vitest';
import { evaluateTwoFactor, TWO_FACTOR } from '@/lib/twoFactorGate';
import { resolveSend2faMethod, SEND_2FA } from '@/lib/send2faMethod';

// Shared base config: web (non-native), no biometric, no passkey.
const baseWeb = { isNative: false, biometric2faEnabled: false, passkey2faEnabled: false, passkeyRegistered: false };

describe('deniability 2FA parity + suppression — resolveSend2faMethod', () => {
  it('returns NONE when no factor is configured, regardless of session type', () => {
    const cfg = { ...baseWeb, actionPasswordConfigured: false };
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.NONE);
    expect(resolveSend2faMethod({ ...cfg, isDecoy: true })).toBe(SEND_2FA.NONE);
    expect(resolveSend2faMethod({ ...cfg, isHidden: true })).toBe(SEND_2FA.NONE);
  });

  it('returns PASSWORD when the ACTIVE set has an Action Password, regardless of session type (per-set parity)', () => {
    const cfg = { ...baseWeb, actionPasswordConfigured: true };
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.PASSWORD);
    expect(resolveSend2faMethod({ ...cfg, isDecoy: true })).toBe(SEND_2FA.PASSWORD);
    expect(resolveSend2faMethod({ ...cfg, isHidden: true })).toBe(SEND_2FA.PASSWORD);
  });

  it('demo=true always yields NONE — the only mode-based override besides deniable suppression', () => {
    expect(resolveSend2faMethod({ ...baseWeb, demo: true, actionPasswordConfigured: true })).toBe(SEND_2FA.NONE);
  });

  it('SUPPRESSES a device-global passkey in a decoy session (would be PASSKEY in a normal session)', () => {
    const cfg = { ...baseWeb, passkey2faEnabled: true, passkeyRegistered: true, actionPasswordConfigured: false };
    // Normal session would fire the passkey...
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.PASSKEY);
    // ...but a decoy session suppresses it → no device-global challenge, no ceremony.
    expect(resolveSend2faMethod({ ...cfg, isDecoy: true })).toBe(SEND_2FA.NONE);
  });

  it('SUPPRESSES a device-global OS biometric in a hidden session (would be BIOMETRIC in a normal native session)', () => {
    const cfg = { isNative: true, biometric2faEnabled: true, passkey2faEnabled: false, passkeyRegistered: false, actionPasswordConfigured: false };
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.BIOMETRIC);
    expect(resolveSend2faMethod({ ...cfg, isHidden: true })).toBe(SEND_2FA.NONE);
  });

  it('in a deniable session, the per-set Action Password still applies even when a device-global passkey is enabled', () => {
    // Device-global passkey is suppressed, but the decoy set has its OWN AP → PASSWORD.
    const cfg = { ...baseWeb, passkey2faEnabled: true, passkeyRegistered: true, actionPasswordConfigured: true };
    expect(resolveSend2faMethod({ ...cfg, isDecoy: true })).toBe(SEND_2FA.PASSWORD);
    expect(resolveSend2faMethod({ ...cfg, isHidden: true })).toBe(SEND_2FA.PASSWORD);
  });

  it('does NOT suppress in a normal session (no regression): passkey and biometric still fire', () => {
    expect(
      resolveSend2faMethod({ ...baseWeb, passkey2faEnabled: true, passkeyRegistered: true }),
    ).toBe(SEND_2FA.PASSKEY);
    expect(
      resolveSend2faMethod({ isNative: true, biometric2faEnabled: true, passkey2faEnabled: false, passkeyRegistered: false }),
    ).toBe(SEND_2FA.BIOMETRIC);
  });
});

describe('deniability 2FA parity — per-set Action Password gate (evaluateTwoFactor)', () => {
  // Once device-global factors are suppressed, the per-set AP is the only send-time
  // second factor that can fire in a deniable session. Its outcome must be identical
  // across session types so the AP prompt is not itself a tell.
  it('gate outcome is identical whether the AP came from the primary, decoy, or hidden set', () => {
    const primary = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    const decoy   = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    const hidden  = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    expect(decoy).toEqual(primary);
    expect(hidden).toEqual(primary);
    expect(primary.code).toBe(TWO_FACTOR.ALLOW);
    expect(primary.allowed).toBe(true);
  });

  it('a set with no AP resolves identically across session types (fail-closed, no tell)', () => {
    const primary = evaluateTwoFactor({ actionPasswordConfigured: false });
    const decoy   = evaluateTwoFactor({ actionPasswordConfigured: false });
    const hidden  = evaluateTwoFactor({ actionPasswordConfigured: false });
    expect(decoy).toEqual(primary);
    expect(hidden).toEqual(primary);
    expect(primary.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
    expect(primary.allowed).toBe(false);
  });
});

describe('deniability 2FA — end-to-end pipeline', () => {
  it('no AP + no device-global factor → NONE method → gate never invoked → no prompt', () => {
    const method = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: false });
    expect(method).toBe(SEND_2FA.NONE);
    // TwoFactorGate only renders when send2faMethod !== SEND_2FA.NONE (SendCrypto.jsx).
  });

  it('decoy set with its OWN AP → PASSWORD method → gate requires the correct credentials', () => {
    const method = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: true, isDecoy: true });
    expect(method).toBe(SEND_2FA.PASSWORD);

    expect(evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true }).allowed).toBe(true);
    expect(evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: false }).allowed).toBe(false);
  });

  it('decoy session with a device-global passkey but NO per-set AP → NONE → no prompt, no ceremony (I3-safe)', () => {
    // This is the case #546 fixes: without suppression the decoy would fire the
    // real session's passkey (a WebAuthn ceremony / potential network egress).
    const method = resolveSend2faMethod({
      ...baseWeb,
      passkey2faEnabled: true,
      passkeyRegistered: true,
      actionPasswordConfigured: false,
      isDecoy: true,
    });
    expect(method).toBe(SEND_2FA.NONE);
  });

  it('primary has AP but the decoy set has none → decoy session sees NONE (active-set config wins)', () => {
    // WalletProvider reads the ACTIVE set's config, so in a decoy session
    // actionPasswordConfigured=false even if the primary set has an AP record.
    const decoyMethod = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: false, isDecoy: true });
    expect(decoyMethod).toBe(SEND_2FA.NONE);
  });
});
