// WalletEntry — "Restore from backup file" onboarding entry point.
//
// A fresh install today offers only Create-new / Import-seed. This adds a third
// path: restore from an encrypted .enc backup + its own backup password/PIN, WITHOUT
// the seed phrase. The encrypted backup carries its OWN credential, so restore must
// NOT be forced through a new-PIN pin-create re-wrap; after a successful restore the
// vault EXISTS on device and the user is routed into the normal UNLOCK screen (then
// the mandatory KEK enrollment gate, kekOrigin='restored').
//
// The shared RestoreFromFile component is stubbed here — its own crypto/gating flow
// is covered by src/components/backup/__tests__/RestoreFromFile.test.jsx. These tests
// pin only WalletEntry's WIRING: the entry point is reachable, onBack returns, and
// onFinish routes into the PIN-cohort unlock surface (owner decision 2026-07-16).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));

let authModelValue = 'pin';
vi.mock('@/lib/authModel', () => ({
  getAuthModel: vi.fn(() => authModelValue),
  setAuthModel: vi.fn((m) => { authModelValue = m; }),
  shouldAutoCacheTypedPin: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: 'Face ID' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

// Stub the shared restore component: expose its two wiring props as buttons so we
// can drive the WalletEntry state machine without the real file/crypto flow.
vi.mock('@/components/backup/RestoreFromFile', () => ({
  default: ({ onBack, onFinish }) => (
    <div data-testid="restore-from-file-stub">
      <button onClick={onBack}>stub-back</button>
      <button onClick={onFinish}>stub-finish</button>
    </div>
  ),
}));

import { useWallet } from '@/lib/WalletProvider';
import { setAuthModel } from '@/lib/authModel';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => false), // fresh device → welcome
    unlock: vi.fn(),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    clearVault: vi.fn(), validateMnemonic: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  authModelValue = 'pin';
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => cleanup());

describe('WalletEntry — Restore from backup file onboarding entry', () => {
  it('exposes a reachable "Restore from backup file" entry on the welcome screen', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    const restoreEntry = screen.getByRole('button', { name: /restore from (a )?backup file/i });
    fireEvent.click(restoreEntry);

    await waitFor(() => expect(screen.getByTestId('restore-from-file-stub')).toBeTruthy());
  });

  it('does NOT force restore through pin-create (the backup carries its own credential)', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /restore from (a )?backup file/i }));

    await waitFor(() => expect(screen.getByTestId('restore-from-file-stub')).toBeTruthy());
    // The restore surface is NOT the numeric pin-create screen.
    expect(screen.queryByText(/choose an 8-digit pin/i)).toBeNull();
  });

  it('onFinish routes into the PIN-cohort UNLOCK screen and marks authModel=pin', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /restore from (a )?backup file/i }));
    await waitFor(() => expect(screen.getByTestId('restore-from-file-stub')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'stub-finish' }));

    // Restored vault → normal unlock surface. Restore always yields a PIN-cohort
    // vault (both backup-credential paths re-wrap under a device PIN via
    // finalisePinRestore), so the unlock view renders a numeric PinPad.
    await waitFor(() => expect(screen.getByLabelText(/pin entry/i)).toBeTruthy());
    expect(setAuthModel).toHaveBeenCalledWith('pin');
  });

  it('onBack returns from the restore surface to the welcome screen', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /restore from (a )?backup file/i }));
    await waitFor(() => expect(screen.getByTestId('restore-from-file-stub')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'stub-back' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy());
  });
});
