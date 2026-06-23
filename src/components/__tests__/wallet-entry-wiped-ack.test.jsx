// WalletEntry — LOUD next-open wipe acknowledgment (owner-approved 2026-06-22).
//
// After ANY local wipe (panic PIN at unlock, the 10-attempt auto-wipe, or the in-app
// guarded wipe), the next app open must LOUDLY tell the user the device was wiped —
// instead of silently dropping to the generic "Get Started" onboarding (no sign the
// keys were destroyed). The provider sets `wasWiped` true (from the in-memory flag OR
// the persisted 'veyrnox-wiped' marker on relaunch). This pins the gate behaviour:
//   - when wasWiped && no vault, the loud "This device was wiped" screen renders FIRST
//     (before welcome/onboarding), with the honest body copy;
//   - both "Start a new wallet" and "Restore from recovery phrase" call acknowledgeWipe()
//     (clearing the marker) BEFORE proceeding, so the loud screen does not reappear.
// We assert STRUCTURE (heading/body presence, acknowledgeWipe call), mocking the
// provider exactly as wallet-entry-pin-wipe.test.jsx does.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

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
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false,
    hasVault: vi.fn(async () => false),  // wiped device → NO vault
    unlock: vi.fn(),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: true,
    acknowledgeWipe: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* shimmed */ } });
afterEach(() => { cleanup(); });

describe('WalletEntry — loud next-open wipe acknowledgment', () => {
  it('renders the LOUD "This device was wiped" screen when wasWiped && no vault', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<WalletEntry />);

    await waitFor(() => expect(screen.getByText(/this device was wiped/i)).toBeTruthy());
    // Honest body copy: keys permanently destroyed, recoverable ONLY via recovery phrase,
    // server holds nothing. Assert the load-bearing phrasing, not full prose.
    expect(screen.getByText(/permanently destroyed/i)).toBeTruthy();
    // "recovery phrase" appears in both the body copy and the Restore button, so scope
    // to the load-bearing body phrasing (recoverable ONLY via the recovery phrase).
    expect(screen.getByText(/recoverable only with your recovery phrase/i)).toBeTruthy();
    // Both escape actions present.
    expect(screen.getByRole('button', { name: /start a new wallet/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore from recovery phrase/i })).toBeTruthy();
  });

  it('"Start a new wallet" calls acknowledgeWipe (clears the marker before proceeding)', async () => {
    const acknowledgeWipe = vi.fn();
    vi.mocked(useWallet).mockReturnValue(makeCtx({ acknowledgeWipe }));
    render(<WalletEntry />);

    await waitFor(() => expect(screen.getByText(/this device was wiped/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /start a new wallet/i }));
    expect(acknowledgeWipe).toHaveBeenCalledTimes(1);
  });

  it('"Restore from recovery phrase" calls acknowledgeWipe (clears the marker before proceeding)', async () => {
    const acknowledgeWipe = vi.fn();
    vi.mocked(useWallet).mockReturnValue(makeCtx({ acknowledgeWipe }));
    render(<WalletEntry />);

    await waitFor(() => expect(screen.getByText(/this device was wiped/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /restore from recovery phrase/i }));
    expect(acknowledgeWipe).toHaveBeenCalledTimes(1);
  });

  it('does NOT show the wiped screen when wasWiped is false (normal first-run)', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx({ wasWiped: false }));
    render(<WalletEntry />);
    // Give the mount probe a tick to resolve to the normal onboarding path.
    await waitFor(() => expect(screen.queryByText(/this device was wiped/i)).toBeNull());
  });
});
