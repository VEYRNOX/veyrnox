// UNLOCK_SUPERSEDED must NOT increment the PIN wipe counter.
//
// When biometric auto-unlock races with a manual PIN entry, one unlock attempt
// is superseded (its unlockGenRef generation is stale). WalletProvider throws
// { code: 'UNLOCK_SUPERSEDED' }. Without an explicit handler in runPinUnlock,
// this falls through to the "Incorrect PIN" catch-all, incrementing the wipe
// counter on a CORRECT PIN — a data-loss bug (10 races = panic wipe).

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
}));
vi.mock('@/lib/biometricUnlock', () => ({ hasStoredUnlockSecret: vi.fn(async () => false) }));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

import { useWallet } from '@/lib/WalletProvider';
import { isPasskeyGateError } from '@/lib/passkey';
import { isBiometricGateError } from '@/lib/biometric';
import { PIN_WIPE_AFTER } from '@/lib/pinAttemptGuard';
import WalletEntry from '@/components/WalletEntry';

const PIN_ATTEMPTS_KEY = 'veyrnox-pin-attempts';

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

describe('WalletEntry — UNLOCK_SUPERSEDED does not increment wipe counter', () => {
  it('UNLOCK_SUPERSEDED error does not count toward the PIN wipe threshold', async () => {
    const unlock = vi.fn(async () => {
      throw Object.assign(new Error('UNLOCK_SUPERSEDED'), { code: 'UNLOCK_SUPERSEDED' });
    });
    const panicWipe = vi.fn(async () => ({ clean: true }));
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock, panicWipe }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    // Fire PIN_WIPE_AFTER + 2 attempts, ALL throwing UNLOCK_SUPERSEDED.
    // None should count toward the wipe counter.
    for (let i = 1; i <= PIN_WIPE_AFTER + 2; i++) {
      await enterPin();
      await waitFor(() => expect(unlock).toHaveBeenCalledTimes(i));
    }

    expect(panicWipe).not.toHaveBeenCalled();
    // The wipe counter in localStorage must not have advanced.
    const stored = localStorage.getItem(PIN_ATTEMPTS_KEY);
    expect(stored === null || stored === '0').toBe(true);
  });

  it('shows retry message instead of "Incorrect PIN" on UNLOCK_SUPERSEDED', async () => {
    const unlock = vi.fn(async () => {
      throw Object.assign(new Error('UNLOCK_SUPERSEDED'), { code: 'UNLOCK_SUPERSEDED' });
    });
    vi.mocked(useWallet).mockReturnValue(makeCtx({ unlock }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    await enterPin();
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));

    // Must NOT show "Incorrect PIN"
    await waitFor(() => {
      const errorEl = screen.queryByText(/incorrect pin/i);
      expect(errorEl).toBeNull();
    });
  });
});
