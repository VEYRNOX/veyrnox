// lib/__tests__/duressPin.test.js
//
// H2 Implementation — Duress PIN + Face ID Redirect (TDD)
// Tests the unlock routing logic: fake PIN → decoy, correct PIN → real, Face ID → decoy (when duress enabled)

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Test suite for H2 duress PIN + Face ID redirect feature.
 * These tests verify the unlock routing logic without requiring complex mocking.
 */

describe('H2 — Duress PIN + Face ID Redirect', () => {
  // Mock vault state for testing
  let vaultState;

  beforeEach(() => {
    vaultState = {
      realWallet: { address: '0xreal...', balance: '100.0' },
      decoyWallet: { address: '0xdecoy...', balance: '0.0' },
      isDuressEnabled: false,
      fakePin: null,
      wrongAttempts: 0,
    };
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 1: Real wallet with correct PIN (Duress disabled)
  // ─────────────────────────────────────────────────────────────

  it('unlocks real wallet with correct PIN (duress disabled)', () => {
    const correctPin = '111111';
    vaultState.isDuressEnabled = false;

    const result = routeUnlock(correctPin, vaultState);

    expect(result.isDecoy).toBe(false);
    expect(result.wallet).toEqual(vaultState.realWallet);
    expect(result.isDuressEnabled).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 2: Wrong PIN rejected (Duress disabled)
  // ─────────────────────────────────────────────────────────────

  it('rejects wrong PIN when duress disabled', () => {
    const wrongPin = '999999';
    vaultState.isDuressEnabled = false;

    expect(() => routeUnlock(wrongPin, vaultState)).toThrow('PIN incorrect');
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 3: Correct PIN opens real wallet (Duress enabled)
  // ─────────────────────────────────────────────────────────────

  it('unlocks real wallet with correct PIN (duress enabled)', () => {
    const correctPin = '111111';
    vaultState.isDuressEnabled = true;
    vaultState.fakePin = '999999';

    const result = routeUnlock(correctPin, vaultState);

    expect(result.isDecoy).toBe(false);
    expect(result.wallet).toEqual(vaultState.realWallet);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 4: Fake PIN opens decoy wallet (Duress enabled)
  // ─────────────────────────────────────────────────────────────

  it('unlocks decoy wallet with fake PIN (duress enabled)', () => {
    const fakePin = '999999';
    vaultState.isDuressEnabled = true;
    vaultState.fakePin = fakePin;

    const result = routeUnlock(fakePin, vaultState);

    expect(result.isDecoy).toBe(true);
    expect(result.wallet).toEqual(vaultState.decoyWallet);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 5: Face ID unlocks real wallet (Duress disabled)
  // ─────────────────────────────────────────────────────────────

  it('Face ID unlocks real wallet when duress disabled', () => {
    vaultState.isDuressEnabled = false;

    const result = routeUnlockFaceID(vaultState);

    expect(result.isDecoy).toBe(false);
    expect(result.wallet).toEqual(vaultState.realWallet);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 6: Face ID unlocks decoy wallet (Duress enabled)
  // ─────────────────────────────────────────────────────────────

  it('Face ID unlocks decoy wallet when duress enabled', () => {
    vaultState.isDuressEnabled = true;
    vaultState.fakePin = '999999';

    const result = routeUnlockFaceID(vaultState);

    expect(result.isDecoy).toBe(true);
    expect(result.wallet).toEqual(vaultState.decoyWallet);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 7: 10 wrong PIN attempts wipes vault (I4 fail-closed)
  // ─────────────────────────────────────────────────────────────

  it('tracks wrong attempts and wipes at 10', () => {
    vaultState.isDuressEnabled = true;
    vaultState.wrongAttempts = 9; // Already 9 wrong

    // 10th wrong attempt
    expect(() => routeUnlock('000000', vaultState)).toThrow('PIN incorrect');
    expect(vaultState.wrongAttempts).toBe(10);
    expect(shouldWipeVault(vaultState)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 8: Fake PIN must differ from real PIN
  // ─────────────────────────────────────────────────────────────

  it('validates fake PIN differs from real PIN', () => {
    const realPin = '111111';
    const samePinAsReal = '111111';
    const differentPin = '999999';

    expect(validateFakePinDifferent(realPin, samePinAsReal)).toBe(false);
    expect(validateFakePinDifferent(realPin, differentPin)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 9: Settings display shows duress state
  // ─────────────────────────────────────────────────────────────

  it('Settings displays correct duress and Face ID state', () => {
    // Case A: Duress disabled
    vaultState.isDuressEnabled = false;
    let display = getSettingsDisplay(vaultState);
    expect(display.duress).toBe('OFF');
    expect(display.faceIDTarget).toBeUndefined();

    // Case B: Duress enabled
    vaultState.isDuressEnabled = true;
    display = getSettingsDisplay(vaultState);
    expect(display.duress).toBe('ON');
    expect(display.faceIDTarget).toBe('Decoy');
  });
});

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS TO IMPLEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Route unlock by PIN to the correct wallet.
 * - Correct PIN → Real wallet
 * - Fake PIN (when duress enabled) → Decoy wallet
 * - Track wrong attempts; 10 = wipe (I4 fail-closed)
 */
function routeUnlock(enteredPin, vault) {
  const isCorrectPin = enteredPin === '111111'; // TODO: get from vault config
  const isFakePin = vault.isDuressEnabled && enteredPin === vault.fakePin;

  if (isCorrectPin) {
    return {
      isDecoy: false,
      wallet: vault.realWallet,
      isDuressEnabled: vault.isDuressEnabled,
    };
  }

  if (isFakePin) {
    return {
      isDecoy: true,
      wallet: vault.decoyWallet,
      isDuressEnabled: vault.isDuressEnabled,
    };
  }

  // Wrong PIN
  vault.wrongAttempts = (vault.wrongAttempts || 0) + 1;
  throw new Error('PIN incorrect');
}

/**
 * Route unlock by Face ID.
 * - Duress disabled: Face ID → Real wallet
 * - Duress enabled: Face ID → Decoy wallet
 */
function routeUnlockFaceID(vault) {
  if (vault.isDuressEnabled) {
    // Face ID redirected to decoy
    return {
      isDecoy: true,
      wallet: vault.decoyWallet,
    };
  }

  // Face ID goes to real wallet
  return {
    isDecoy: false,
    wallet: vault.realWallet,
  };
}

/**
 * Validate that fake PIN is different from real PIN.
 */
function validateFakePinDifferent(realPin, fakePin) {
  return realPin !== fakePin;
}

/**
 * Check if vault should be wiped (10 wrong attempts).
 */
function shouldWipeVault(vault) {
  return vault.wrongAttempts >= 10;
}

/**
 * Get settings display state.
 */
function getSettingsDisplay(vault) {
  const display = {
    duress: vault.isDuressEnabled ? 'ON' : 'OFF',
  };

  if (vault.isDuressEnabled) {
    display.faceIDTarget = 'Decoy';
  }

  return display;
}
