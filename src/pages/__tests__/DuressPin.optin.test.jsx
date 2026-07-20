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
const { getBiometricStatus, isBiometricUnlockEnabled } = vi.hoisted(() => ({
  getBiometricStatus: vi.fn(async () => ({
    mode: 'native', available: true, label: 'Face ID', simulated: false, detail: '',
  })),
  // Default: biometric UNLOCK was not previously armed. H-3 tests flip this on.
  isBiometricUnlockEnabled: vi.fn(() => false),
}));
vi.mock('@/lib/biometric', () => ({
  getBiometricStatus, isBiometricUnlockEnabled, setBiometricUnlockEnabled: vi.fn(),
}));

vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin', isPinModel: () => true }));

import DuressPin from '@/pages/DuressPin';

async function renderSettled() {
  await act(async () => { render(<MemoryRouter><DuressPin /></MemoryRouter>); });
}

// Drive the two-step PinPad flow. onComplete fires only on explicit submit
// (never auto-submits at N digits — deniability §7). The submit button always
// carries aria-label="Submit PIN" regardless of the submitLabel prop.
// An explicit act() flush between steps is required: without it the outer act()
// batches all state updates together so `pin` never accumulates between digit clicks.
async function enterBothPins(pin = '24681357') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' })); // step 1 → confirm step
  });
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' })); // step 2 → handleSave
}

beforeEach(() => {
  mockSetDuressPin.mockClear();
  mockEnableDecoyBiometricUnlock.mockClear();
  isBiometricUnlockEnabled.mockReturnValue(false);
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

  it('HONEST copy: makes clear Face ID opens the HIDDEN wallet and the real wallet needs the real PIN', async () => {
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    const text = document.body.textContent.toLowerCase();
    expect(text).toMatch(/hidden wallet/);
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
    // Check opt-in on step 1 (visible throughout both steps)
    fireEvent.click(optin);
    await enterBothPins('24681357');

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalledWith('24681357'));
    await waitFor(() => expect(mockEnableDecoyBiometricUnlock).toHaveBeenCalledWith('24681357'));
  });

  it('saving with the opt-in UNCHECKED never enables Face-ID-for-decoy', async () => {
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    // Leave opt-in unchecked
    await enterBothPins('24681357');

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalledWith('24681357'));
    expect(mockEnableDecoyBiometricUnlock).not.toHaveBeenCalled();
  });
});

// H-3: setDuressPin now force-clears any pre-existing biometric unlock cache, so a
// user who previously had one-tap unlock armed for the REAL wallet loses it here.
// The screen must SAY SO (I4) rather than leave copy implying Face ID now opens the
// decoy — which would be false when the user did not opt in.
describe('DuressPin — H-3 honest notice when biometric unlock was turned off', () => {
  it('tells the user Face ID was turned off when it WAS armed and they did NOT opt in', async () => {
    isBiometricUnlockEnabled.mockReturnValue(true);
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    await enterBothPins('24681357');

    const notice = await screen.findByTestId('bio-turned-off-notice');
    const text = notice.textContent.toLowerCase();
    expect(text).toMatch(/turned off|switched off/);
    expect(text).toMatch(/face id/);
  });

  it('does NOT show the notice when the user opted into biometric for the hidden wallet', async () => {
    isBiometricUnlockEnabled.mockReturnValue(true);
    await renderSettled();
    fireEvent.click(await screen.findByTestId('decoy-biometric-optin'));
    await enterBothPins('24681357');

    await waitFor(() => expect(mockEnableDecoyBiometricUnlock).toHaveBeenCalled());
    expect(screen.queryByTestId('bio-turned-off-notice')).toBeNull();
  });

  it('does NOT show the notice when biometric unlock was never armed', async () => {
    isBiometricUnlockEnabled.mockReturnValue(false);
    await renderSettled();
    await screen.findByTestId('decoy-biometric-optin');
    await enterBothPins('24681357');

    await waitFor(() => expect(mockSetDuressPin).toHaveBeenCalled());
    expect(screen.queryByTestId('bio-turned-off-notice')).toBeNull();
  });
});

// P2 (I4 fail-honest). enableDecoyBiometricUnlock returns FALSE outside the PIN cohort,
// when no sensor is available, or when the secure store refuses the write — and it can
// throw. The screen previously continued silently: the decoy was reported saved, and if
// biometric unlock had NOT been armed beforehand, NO notice rendered at all, leaving the
// user believing one-tap opens the Emergency wallet when nothing is bound to it.
describe('DuressPin — honest notice when the biometric opt-in does not take', () => {
  it('tells the user when the opt-in returned false and biometric was never armed', async () => {
    isBiometricUnlockEnabled.mockReturnValue(false);
    mockEnableDecoyBiometricUnlock.mockResolvedValueOnce(false);
    await renderSettled();
    fireEvent.click(await screen.findByTestId('decoy-biometric-optin'));
    await enterBothPins('24681357');

    const notice = await screen.findByTestId('bio-optin-failed-notice');
    expect(notice.textContent.toLowerCase()).toMatch(/face id/);
  });

  it('tells the user when the opt-in THREW (store failure) — decoy still saved', async () => {
    isBiometricUnlockEnabled.mockReturnValue(false);
    mockEnableDecoyBiometricUnlock.mockRejectedValueOnce(new Error('secure store unavailable'));
    await renderSettled();
    fireEvent.click(await screen.findByTestId('decoy-biometric-optin'));
    await enterBothPins('24681357');

    await screen.findByTestId('bio-optin-failed-notice');
    // The decoy itself is still reported saved — the failure is the biometric binding,
    // not the Emergency PIN, and we must not throw away a provisioned decoy vault.
    expect(document.body.textContent).toMatch(/Emergency wallet created/);
  });

  it('shows NO failure notice when the opt-in succeeded', async () => {
    isBiometricUnlockEnabled.mockReturnValue(false);
    await renderSettled();
    fireEvent.click(await screen.findByTestId('decoy-biometric-optin'));
    await enterBothPins('24681357');

    await waitFor(() => expect(mockEnableDecoyBiometricUnlock).toHaveBeenCalled());
    expect(screen.queryByTestId('bio-optin-failed-notice')).toBeNull();
  });
});
