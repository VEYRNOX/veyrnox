// DuressPin screen — "Use Face ID to open the decoy" opt-in (target item 3).
//
// Pins the UI contract:
//   - The opt-in is shown ONLY when biometrics are available on this device.
//   - It is OFF by default.
//   - Saving with it CHECKED calls setDuressPin(pin) THEN
//     enableDecoyBiometricUnlock(pin) (cache the DURESS pin behind Face ID).
//   - Saving with it UNCHECKED never calls enableDecoyBiometricUnlock.
//   - Honest copy: Face ID opens the DECOY; the real wallet needs the real PIN.
//
// We assert STRUCTURE (testid + call args) and the load-bearing honesty words
// (decoy / real PIN), not full prose. useWallet + useActionGuard are mocked; the
// action guard runs its action immediately (no second factor configured).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';

const { mockSetDuressPin, mockEnableDecoyBiometricUnlock } = vi.hoisted(() => ({
  mockSetDuressPin: vi.fn(async () => ({ mnemonic: 'a b c', address: '0xDECOY' })),
  mockEnableDecoyBiometricUnlock: vi.fn(async () => true),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true, isDecoy: false, accounts: [{ address: '0xREAL' }],
    hasVault: vi.fn(async () => true),
    setDuressPin: mockSetDuressPin,
    removeDuressPin: vi.fn(),
    enableDecoyBiometricUnlock: mockEnableDecoyBiometricUnlock,
    createWallet: vi.fn(), unlock: vi.fn(), lock: vi.fn(), clearVault: vi.fn(),
  }),
}));

// Action guard: run the action immediately (no 2FA configured).
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

// Default: biometrics AVAILABLE so the opt-in renders. Overridden per-test.
// vi.hoisted so the spy exists when the (hoisted) vi.mock factory runs.
const { getBiometricStatus } = vi.hoisted(() => ({
  getBiometricStatus: vi.fn(async () => ({
    mode: 'native', available: true, label: 'Face ID', simulated: false, detail: '',
  })),
}));
vi.mock('@/lib/biometric', () => ({ getBiometricStatus }));

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', isPinModel: () => true }));

import DuressPin from '@/pages/DuressPin';

async function renderSettled() {
  await act(async () => { render(<DuressPin />); });
}

function setPins(pin = '24681357') {
  fireEvent.change(screen.getByLabelText('New Duress PIN'), { target: { value: pin } });
  fireEvent.change(screen.getByLabelText('Confirm Duress PIN'), { target: { value: pin } });
}

beforeEach(() => {
  mockSetDuressPin.mockClear();
  mockEnableDecoyBiometricUnlock.mockClear();
  getBiometricStatus.mockResolvedValue({
    mode: 'native', available: true, label: 'Face ID', simulated: false, detail: '',
  });
});
afterEach(() => { cleanup(); });

describe('DuressPin — Face-ID-opens-the-decoy opt-in', () => {
  it('shows the opt-in, OFF by default, when biometrics are available', async () => {
    await renderSettled();
    const optin = await screen.findByTestId('decoy-biometric-optin');
    expect(optin).toBeTruthy();
    expect(/** @type {HTMLInputElement} */ (optin).checked).toBe(false);
  });

  it('HONEST copy: makes clear Face ID opens the DECOY and the real wallet needs the real PIN', async () => {
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    const text = document.body.textContent.toLowerCase();
    expect(text).toMatch(/decoy/);
    expect(text).toMatch(/real (pin|wallet)/);
  });

  it('does NOT render the opt-in when biometrics are unavailable', async () => {
    getBiometricStatus.mockResolvedValue({
      mode: 'web', available: false, label: 'Biometrics', simulated: false, detail: '',
    });
    await renderSettled();
    // Let the async status probe settle.
    await waitFor(() => expect(screen.queryByTestId('decoy-biometric-optin')).toBeNull());
  });

  it('saving with the opt-in CHECKED caches the DURESS pin behind Face ID', async () => {
    await renderSettled();
    const optin = await screen.findByTestId('decoy-biometric-optin');
    setPins('24681357');
    fireEvent.click(optin);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Set \/ Change duress PIN/i })); });

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalledWith('24681357'));
    await waitFor(() => expect(mockEnableDecoyBiometricUnlock).toHaveBeenCalledWith('24681357'));
  });

  it('saving with the opt-in UNCHECKED never enables Face-ID-for-decoy', async () => {
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    setPins('24681357');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Set \/ Change duress PIN/i })); });

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalledWith('24681357'));
    expect(mockEnableDecoyBiometricUnlock).not.toHaveBeenCalled();
  });
});
