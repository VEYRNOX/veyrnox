// lib/duressPin.js
//
// H2 UNLOCK ROUTING — Duress PIN + Face ID Redirect (S3).
//
// Pure functions for routing PIN-based unlock to the correct wallet:
//   - Correct PIN → Real wallet
//   - Fake PIN (when duress enabled) → Decoy wallet
//   - Face ID behavior depends on duress state
//   - 10 wrong attempts → Vault wipe (I4 fail-closed)
//
// These functions are testable in isolation and DO NOT depend on async vaults
// or encryption — they make routing decisions based on vault state. The actual
// unlock() in WalletProvider still handles the cryptographic paths (primary,
// duress, hidden) — these functions route WHICH path to take.

import { hasDuressVault } from '@/wallet-core/duress';

// Retrieve the wrong PIN attempt counter from localStorage.
// Format: "duress-wrong-attempts"
function getWrongAttempts() {
  try {
    const stored = localStorage.getItem('duress-wrong-attempts');
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0; // fallback on any localStorage error
  }
}

// Persist the wrong PIN attempt counter.
function setWrongAttempts(count) {
  try {
    localStorage.setItem('duress-wrong-attempts', String(count));
  } catch {
    // best-effort: a localStorage write failure never blocks unlock
  }
}

// Clear the wrong PIN attempt counter (e.g., after a successful unlock).
function clearWrongAttempts() {
  try {
    localStorage.removeItem('duress-wrong-attempts');
  } catch {
    // best-effort
  }
}

// Check if the vault should be wiped (≥10 wrong attempts).
export function shouldWipeVault() {
  return getWrongAttempts() >= 10;
}

// Increment the wrong PIN attempt counter.
// Returns the new count (for testing).
function incrementWrongAttempts() {
  const current = getWrongAttempts();
  const next = current + 1;
  setWrongAttempts(next);
  return next;
}

// Validate that a fake PIN differs from the real PIN.
// Used during duress setup to prevent fake PIN = real PIN.
export function validateFakePinDifferent(realPin, fakePin) {
  return realPin !== fakePin;
}

// Get settings display state for the current duress configuration.
export function getSettingsDisplay() {
  const isDuressEnabled = localStorage.getItem('duress-vault-enabled') === 'true';
  const display = {
    duress: isDuressEnabled ? 'ON' : 'OFF',
  };

  if (isDuressEnabled) {
    display.faceIDTarget = 'Decoy';
  }

  return display;
}

// Route PIN unlock to the correct wallet.
//
// Returns an object:
//   { wallet: 'real' | 'decoy', isDecoy: boolean }
//
// Throws "PIN incorrect" on wrong PIN, unless it's the 10th wrong
// attempt, in which case the caller should call wipeVault().
//
// This function does NOT perform the actual unlock() — it only decides
// which path to take. The caller (WalletProvider.unlock) still handles
// the async vault decryption.
export async function routeUnlockByPin(enteredPin, realPin) {
  const isDuressEnabled = await hasDuressVault();
  const fakePinStorageKey = 'duress-fake-pin'; // NOT persisted in main flow; added by test setup
  const fakePin = localStorage.getItem(fakePinStorageKey);

  // Correct real PIN always unlocks the real wallet
  if (enteredPin === realPin) {
    clearWrongAttempts();
    return { wallet: 'real', isDecoy: false };
  }

  // If duress is enabled and fake PIN matches, unlock decoy
  if (isDuressEnabled && fakePin && enteredPin === fakePin) {
    clearWrongAttempts();
    return { wallet: 'decoy', isDecoy: true };
  }

  // Wrong PIN — increment counter and check for wipe threshold
  const attempts = incrementWrongAttempts();
  if (attempts >= 10) {
    // Caller will call wipeVault() after handling the error
    throw Object.assign(new Error('PIN incorrect — vault will be wiped'), {
      wipeRequired: true,
      attemptNumber: attempts,
    });
  }

  throw new Error('PIN incorrect');
}

// Route Face ID unlock based on duress state.
//
// Returns:
//   { wallet: 'real' | 'decoy', isDecoy: boolean }
//
// Default (no duress):
//   Face ID → Real wallet
//
// With duress enabled:
//   Face ID → Decoy wallet
//
// This is implemented via the biometric cache in WalletProvider:
// - enableBiometricUnlock() caches the real PIN
// - enableDecoyBiometricUnlock() caches the duress PIN (overwrites it)
// - unlockWithBiometric() retrieves the cached PIN and calls unlock()
//
// So this function is informational; the actual routing happens in the
// biometric cache + unlock path.
export async function routeUnlockByFaceID() {
  const isDuressEnabled = await hasDuressVault();
  if (isDuressEnabled) {
    return { wallet: 'decoy', isDecoy: true };
  }
  return { wallet: 'real', isDecoy: false };
}

// Reset all H2 state (used for testing + demo reset).
export function resetH2State() {
  clearWrongAttempts();
  try { localStorage.removeItem('duress-fake-pin'); } catch {}
  try { localStorage.removeItem('duress-vault-enabled'); } catch {}
}
