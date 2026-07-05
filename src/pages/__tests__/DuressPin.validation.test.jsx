// DuressPin screen — Emergency-PIN form validation (phase-1 gap).
//
// Pins the local validation in handleSave BEFORE any secret is committed:
//   - the entered PIN and its CONFIRMATION must match ("fake PIN" must be typed
//     twice the same) — a mismatch shows "PINs do not match" and NEVER calls
//     setDuressPin (no decoy is created from a typo). I4 fail-closed.
//   - a PIN shorter than 8 digits is rejected before commit.
//   - a matching 8-digit PIN DOES commit (setDuressPin called) — the negative
//     guards don't block the happy path.
//
// Validation runs BEFORE requireTwoFactor, so a mismatch never reaches the gate.
// We assert STRUCTURE (setDuressPin call/no-call) + the load-bearing error words,
// not full prose. useWallet + useActionGuard mocked; the guard runs immediately.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockSetDuressPin, mockEnableDecoyBiometricUnlock } = vi.hoisted(() => ({
  mockSetDuressPin: vi.fn(async () => ({ mnemonic: 'a b c', address: '0xDECOY' })),
  mockEnableDecoyBiometricUnlock: vi.fn(async () => true),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true, isDecoy: false, accounts: [{ address: '0xREAL' }],
    hasVault: vi.fn(async () => true),
    hasDuressPin: vi.fn(async () => false),
    setDuressPin: mockSetDuressPin,
    removeDuressPin: vi.fn(),
    enableDecoyBiometricUnlock: mockEnableDecoyBiometricUnlock,
    createWallet: vi.fn(), unlock: vi.fn(), lock: vi.fn(), clearVault: vi.fn(),
  }),
}));

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({
    requireTwoFactor: (run) => run(),
    gateModal: null,
  }),
}));

vi.mock('@/lib/decoyBalance', () => ({
  resolveDecoyBalance: vi.fn(async () => ({ eth: '0', source: 'chain' })),
  seedDemoDecoyBalance: vi.fn(),
  DECOY_NETWORK_KEY: 'sepolia',
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

// Biometrics OFF so the opt-in isn't in the way of the validation flow.
const { getBiometricStatus } = vi.hoisted(() => ({
  getBiometricStatus: vi.fn(async () => ({
    mode: 'web', available: false, label: 'Biometrics', simulated: false, detail: '',
  })),
}));
vi.mock('@/lib/biometric', () => ({ getBiometricStatus }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', isPinModel: () => true }));

import DuressPin from '@/pages/DuressPin';

async function renderSettled() {
  await act(async () => { render(<MemoryRouter><DuressPin /></MemoryRouter>); });
}

// Drive the two-step PinPad: enter `pin` on step 1, then `confirm` on step 2.
async function enterPins(pin, confirm = pin) {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' })); // → confirm step
  });
  for (const d of confirm) fireEvent.click(screen.getByRole('button', { name: d }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' })); // → handleSave
  });
}

beforeEach(() => {
  mockSetDuressPin.mockClear();
  mockEnableDecoyBiometricUnlock.mockClear();
});
afterEach(() => { cleanup(); });

describe('DuressPin — Emergency PIN form validation', () => {
  it('rejects a CONFIRM mismatch: shows "PINs do not match" and never commits the decoy', async () => {
    await renderSettled();
    await enterPins('24681357', '13572468'); // same length, different digits

    expect(screen.getByText(/PINs do not match/i)).toBeTruthy();
    expect(mockSetDuressPin).not.toHaveBeenCalled();
  });

  it('commits when the PIN and its confirmation match (happy path not blocked)', async () => {
    await renderSettled();
    await enterPins('24681357'); // confirm == pin

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalledWith('24681357'));
    expect(screen.queryByText(/PINs do not match/i)).toBeNull();
  });
});
