// WalletEntry — UNLOCK_SUPERSEDED must NOT count toward the panic-wipe counter.
//
// PR #1825 added UNLOCK_SUPERSEDED (race guard) but never added it to the error
// cascade in runPinUnlock. Without a handler it falls through to the "Incorrect PIN"
// catch-all and increments the wipe counter — so a lock-during-equalizer timing
// window can brick a user's wallet after 10 fires. This test pins the fix.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(), notification: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() }));
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: 'Face ID' })),
  hasBiometricConsentBeenRecorded: () => true,
}));
vi.mock('@/lib/biometricUnlock', () => ({ hasStoredUnlockSecret: vi.fn(async () => false) }));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

import { useWallet } from '@/lib/WalletProvider';
import { isPasskeyGateError } from '@/lib/passkey';
import { isBiometricGateError } from '@/lib/biometric';
import { PIN_WIPE_AFTER } from '@/lib/pinAttemptGuard';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

async function enterPin(pin = '13572468') {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));
}

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

beforeEach(() => {
  vi.mocked(isPasskeyGateError).mockReturnValue(false);
  vi.mocked(isBiometricGateError).mockReturnValue(false);
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('UNLOCK_SUPERSEDED must not count toward panic wipe', () => {
  it('does NOT increment wipe counter — even past PIN_WIPE_AFTER fires', async () => {
    const unlock = vi.fn(async () => {
      throw Object.assign(new Error('UNLOCK_SUPERSEDED'), { code: 'UNLOCK_SUPERSEDED' });
    });
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    for (let i = 1; i <= PIN_WIPE_AFTER + 2; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }
    expect(panicWipe).not.toHaveBeenCalled();
  });

  it('shows a retry message, not "Incorrect PIN"', async () => {
    const unlock = vi.fn(async () => {
      throw Object.assign(new Error('UNLOCK_SUPERSEDED'), { code: 'UNLOCK_SUPERSEDED' });
    });
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      const errorEl = screen.queryByText(/incorrect pin/i);
      expect(errorEl).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText(/interrupted/i)).toBeTruthy();
    });
  });
});
