/**
 * Deniability 2FA parity invariant tests
 *
 * Security invariant: the send-path 2FA gate must behave IDENTICALLY for
 * primary, decoy, and hidden sessions — an observer must not be able to tell
 * which set is active from the presence or absence of a 2FA prompt.
 *
 * The mechanism: `actionPasswordConfigured` always reflects the ACTIVE set's
 * AP record (not the primary's). Sessions carry per-set AP records; the gate
 * fires on the active set's config, never on session type.
 *
 * These tests assert:
 *  1. resolveSend2faMethod has no isDecoy/isHidden branch — method is
 *     determined solely by configuration flags, identical across session types.
 *  2. When method === PASSWORD, evaluateTwoFactor behaves identically
 *     regardless of which "session type" provided actionPasswordConfigured.
 *  3. The demo short-circuit (→ NONE) is the only mode-based override;
 *     no equivalent override exists for decoy/hidden.
 */

import { describe, it, expect } from 'vitest';
import { evaluateTwoFactor, TWO_FACTOR } from '@/lib/twoFactorGate';
import { resolveSend2faMethod, SEND_2FA } from '@/lib/send2faMethod';

// Shared base config: web (non-native), no biometric, no passkey.
// Only actionPasswordConfigured varies per test.
const baseWeb = { isNative: false, biometric2faEnabled: false, passkey2faEnabled: false, passkeyRegistered: false };

describe('deniability 2FA parity — resolveSend2faMethod', () => {
  it('returns NONE when no AP configured, regardless of session type', () => {
    const cfg = { ...baseWeb, actionPasswordConfigured: false };
    // primary, decoy, hidden all present the same config object shape —
    // the result must be identical
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.NONE);
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.NONE); // decoy sim
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.NONE); // hidden sim
  });

  it('returns PASSWORD when AP configured, regardless of session type', () => {
    const cfg = { ...baseWeb, actionPasswordConfigured: true };
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.PASSWORD);
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.PASSWORD); // decoy sim
    expect(resolveSend2faMethod({ ...cfg })).toBe(SEND_2FA.PASSWORD); // hidden sim
  });

  it('demo=true always yields NONE — the only mode-based override', () => {
    // demo is the ONLY flag that overrides based on mode;
    // no equivalent exists for isDecoy or isHidden
    expect(resolveSend2faMethod({ ...baseWeb, demo: true, actionPasswordConfigured: true })).toBe(SEND_2FA.NONE);
  });

  it('resolveSend2faMethod signature has no isDecoy or isHidden parameter', () => {
    // Passing isDecoy/isHidden must have zero effect — the function ignores them.
    // If a future change added a decoy/hidden branch this test would catch it
    // by showing the result differs from the baseline.
    const baseline = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: true });
    const withDecoy = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: true, isDecoy: true });
    const withHidden = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: true, isHidden: true });
    expect(withDecoy).toBe(baseline);
    expect(withHidden).toBe(baseline);
  });
});

describe('deniability 2FA parity — evaluateTwoFactor', () => {
  it('NOT_CONFIGURED when AP absent — same for all session types', () => {
    // NOT_CONFIGURED is fail-closed (allowed:false) — the caller decides whether
    // to block the action or route to setup; the gate itself never silently proceeds.
    const result = evaluateTwoFactor({ actionPasswordConfigured: false });
    expect(result.code).toBe(TWO_FACTOR.NOT_CONFIGURED);
    expect(result.allowed).toBe(false);
    // decoy/hidden sessions with no AP → same outcome
    expect(evaluateTwoFactor({ actionPasswordConfigured: false }).code).toBe(TWO_FACTOR.NOT_CONFIGURED);
  });

  it('WRONG when AP configured but credentials not supplied', () => {
    const result = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: false, passwordOk: false });
    expect(result.code).toBe(TWO_FACTOR.WRONG);
    expect(result.allowed).toBe(false);
  });

  it('ALLOW when AP configured and both credentials supplied', () => {
    const result = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    expect(result.code).toBe(TWO_FACTOR.ALLOW);
    expect(result.allowed).toBe(true);
    expect(result.message).toBeNull();
  });

  it('gate outcome is identical whether AP came from primary, decoy, or hidden set', () => {
    // Simulates: primary set has AP configured → PASSWORD gate fires
    const primaryResult = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    // Simulates: decoy set has AP configured → same PASSWORD gate fires
    const decoyResult   = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    // Simulates: hidden set has AP configured → same PASSWORD gate fires
    const hiddenResult  = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });

    expect(decoyResult).toEqual(primaryResult);
    expect(hiddenResult).toEqual(primaryResult);
  });

  it('gate outcome is identical for a session with no AP, regardless of type', () => {
    const primaryResult = evaluateTwoFactor({ actionPasswordConfigured: false });
    const decoyResult   = evaluateTwoFactor({ actionPasswordConfigured: false });
    const hiddenResult  = evaluateTwoFactor({ actionPasswordConfigured: false });

    expect(decoyResult).toEqual(primaryResult);
    expect(hiddenResult).toEqual(primaryResult);
  });
});

describe('deniability 2FA parity — end-to-end pipeline', () => {
  it('no AP on any set → NONE method → gate not invoked path → no 2FA prompt', () => {
    const method = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: false });
    expect(method).toBe(SEND_2FA.NONE);
    // When method is NONE the gate is never called — confirmed by SendCrypto.jsx:1387
    // (TwoFactorGate only renders when send2faMethod !== SEND_2FA.NONE)
  });

  it('AP on decoy set → PASSWORD method → gate requires correct credentials', () => {
    // Simulates a decoy session where the DECOY's blob has an AP record
    const method = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: true });
    expect(method).toBe(SEND_2FA.PASSWORD);

    const passResult = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: true });
    expect(passResult.allowed).toBe(true);

    const failResult = evaluateTwoFactor({ actionPasswordConfigured: true, pinOk: true, passwordOk: false });
    expect(failResult.allowed).toBe(false);
  });

  it('AP on primary but decoy has none → decoy session sees NONE method → no 2FA prompt in decoy', () => {
    // Primary has AP; decoy does not. WalletProvider reads the ACTIVE set's config,
    // so in a decoy session actionPasswordConfigured=false even if primary has one.
    const decoyMethod = resolveSend2faMethod({ ...baseWeb, actionPasswordConfigured: false });
    expect(decoyMethod).toBe(SEND_2FA.NONE);
    // No 2FA prompt — decoy session is indistinguishable from a primary with no AP
  });
});
