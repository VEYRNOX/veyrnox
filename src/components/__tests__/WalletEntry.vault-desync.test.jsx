// WalletEntry — native vault/settings desync must NEVER silently destroy keys (I4).
//
// SCENARIO: on native, iOS Keychain persists across app deletes, so a reinstall (or
// a corrupted/partially-cleared localStorage) can find a stale vault with no
// auth-model marker. The OLD behaviour silently called keystore clearVault() on cold
// mount — destroying key material with no user sign-off. If the missing marker was a
// transient/partial wipe rather than a true reinstall, a recoverable wallet is gone
// with no warning (I4 violation: never silently destroy keys).
//
// Contract pinned here:
//  1. Desync detected (native + vault exists + no 'veyrnox-auth-model' marker) →
//     an honest choice screen renders; clearVault is NOT called.
//  2. "Restore from recovery phrase" routes to seed recovery — still no clearVault.
//  3. Wipe requires the typed "WIPE" confirmation; only then does clearVault run.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', async (orig) => {
  const real = await orig();
  return { ...real, getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() };
});
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
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => false) }));
// NATIVE platform — the desync guard only applies where the Keychain outlives the app.
// vi.fn so a single test can flip it to web (false) and pin the native-only guard.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }));
// The destructive call now rides the WalletProvider R2 facade (context clearVault),
// not a direct wallet-core keystore import — WalletEntry no longer reaches into
// @/wallet-core/keystore (ring-import burndown, issue #627). The spy is injected
// through the mocked useWallet context in makeCtx below.
const clearVault = vi.fn(async () => {});

import { useWallet } from '@/lib/WalletProvider';
import { Capacitor } from '@capacitor/core';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => true), // a stale vault IS present
    unlock: vi.fn(async () => ({ ok: true })),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    clearVault, validateMnemonic: vi.fn(() => true),
    ...overrides,
  };
}

beforeEach(() => {
  clearVault.mockClear();
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true); // native by default
  try { localStorage.clear(); } catch { /* shimmed */ } // no 'veyrnox-auth-model' → desync
});
afterEach(() => { cleanup(); });

describe('WalletEntry — native vault/settings desync (I4: no silent key destruction)', () => {
  it('renders the desync choice screen and does NOT silently clearVault on mount', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // The honest desync screen must appear…
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restore from recovery phrase/i })).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: /wipe and start fresh/i })).toBeTruthy();
    // …and the stale vault must still exist: no silent destruction.
    expect(clearVault).not.toHaveBeenCalled();
  });

  it('Restore routes to seed recovery without wiping', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restore from recovery phrase/i })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /restore from recovery phrase/i }));

    // Seed-recovery step renders (a textarea/input for the phrase); vault untouched.
    await waitFor(() => expect(clearVault).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /wipe and start fresh/i })).toBeNull();
  });

  it('Wipe is gated behind the typed WIPE confirmation, then (and only then) clears the vault', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /wipe and start fresh/i })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /wipe and start fresh/i }));

    // Confirmation stage: the destructive button exists but is disabled until "WIPE" is typed.
    const confirmBtn = await screen.findByRole('button', { name: /permanently wipe/i });
    expect(confirmBtn.disabled).toBe(true);
    expect(clearVault).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/type wipe to confirm/i), { target: { value: 'WIPE' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /permanently wipe/i }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /permanently wipe/i }));

    await waitFor(() => expect(clearVault).toHaveBeenCalledTimes(1));
  });

  // Task 1 — after a SUCCESSFUL desync wipe, the loud "device was wiped" notice must
  // render (I4: fail honest). The user's vault was destroyed (silently, by the platform
  // Keychain persistence, then confirmed here) — they get the same unmistakable notice
  // the panic-wipe path shows, not a quiet drop into onboarding.
  it('shows the loud wiped notice after a successful desync wipe (I4: fail honest)', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /wipe and start fresh/i })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /wipe and start fresh/i }));
    fireEvent.change(await screen.findByLabelText(/type wipe to confirm/i), { target: { value: 'WIPE' } });
    fireEvent.click(screen.getByRole('button', { name: /permanently wipe/i }));

    await waitFor(() => expect(clearVault).toHaveBeenCalledTimes(1));
    // The loud, persistent acknowledgement — same as the panic path.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /this device was wiped/i })).toBeTruthy()
    );
  });

  // Task 2A — error path: if clearVault throws, we must fail closed. Stay on the desync
  // screen, surface the error, and NEVER signal a completed wipe (no loud notice) — a
  // partial/failed wipe must not look like a successful one.
  it('fails closed when clearVault throws: stays on desync, shows error, no wiped notice', async () => {
    const boom = vi.fn(async () => { throw new Error('keystore locked'); });
    vi.mocked(useWallet).mockReturnValue(makeCtx({ clearVault: boom }));

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /wipe and start fresh/i })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /wipe and start fresh/i }));
    fireEvent.change(await screen.findByLabelText(/type wipe to confirm/i), { target: { value: 'WIPE' } });
    fireEvent.click(screen.getByRole('button', { name: /permanently wipe/i }));

    await waitFor(() => expect(boom).toHaveBeenCalledTimes(1));
    // The error surfaces AND we remain on the desync confirmation (destructive button present)…
    await waitFor(() => expect(screen.getByText(/keystore locked/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /permanently wipe/i })).toBeTruthy();
    // …and NO completed-wipe signal was raised.
    expect(screen.queryByRole('heading', { name: /this device was wiped/i })).toBeNull();
  });

  // Task 2B — web negative: the desync guard is native-only (the Keychain-outlives-app
  // hazard does not exist on web). Even with a stale vault present and no auth-model
  // marker, the desync screen must NOT render on web.
  it('does NOT render the desync screen on web (native-only guard)', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.mocked(useWallet).mockReturnValue(makeCtx());

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);

    // Give the mount effect a chance to run, then assert the desync UI never appeared.
    await waitFor(() => expect(screen.queryByRole('button', { name: /wipe and start fresh/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /restore from recovery phrase/i })).toBeNull();
    expect(clearVault).not.toHaveBeenCalled();
  });
});
