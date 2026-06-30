// WalletEntry — PIN cohort must NEVER cache the REAL PIN behind Face ID.
//
// CRITICAL (I3/I4). runPinUnlock had an auto-cache block: if biometric unlock was
// enabled and no secret was cached yet, it called enableBiometricUnlock(pin) on the
// FIRST successful PIN unlock. In the PIN cohort this is the REAL PIN — caching it
// behind Face ID makes one-tap Face ID open the REAL wallet, defeating the
// "Face ID = decoy, typed real PIN = real wallet" coercion design (the same bypass
// shouldCacheUnlockSecret() forbids for changePassword).
//
// Contract pinned here (assert STRUCTURE — the enableBiometricUnlock spy — not copy):
// PIN cohort + biometric enabled + empty cache + a CORRECT real-PIN unlock must NOT
// call enableBiometricUnlock. The cohort gate is shouldCacheUnlockSecret({authModel:
// 'pin', ...}) === false.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
// PIN cohort: real shouldCacheUnlockSecret so the cohort gate is exercised honestly.
vi.mock('@/lib/authModel', async (orig) => {
  const real = await orig();
  return { ...real, getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() };
});
// Biometric is ENABLED for this device cohort.
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => true),
  getBiometricStatus: vi.fn(async () => ({ available: true, label: 'Face ID', mode: 'native' })),
}));
// Cache is EMPTY (no stored secret yet) — the condition the old auto-cache fired on.
vi.mock('@/lib/biometricUnlock', () => ({ hasStoredUnlockSecret: vi.fn(async () => false) }));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

import { useWallet } from '@/lib/WalletProvider';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false,
    hasVault: vi.fn(async () => true), // returning-user → 'unlock' view
    unlock: vi.fn(async () => ({ ok: true })), // correct real PIN → succeeds
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(async () => true), unlockWithBiometric: vi.fn(),
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

beforeEach(() => { try { localStorage.clear(); } catch { /* shimmed */ } });
afterEach(() => { cleanup(); });

describe('WalletEntry — PIN cohort never caches the real PIN behind Face ID', () => {
  it('does NOT call enableBiometricUnlock on a correct real-PIN unlock (PIN cohort)', async () => {
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());

    await enterPin();

    // The PIN must unlock the real wallet…
    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledWith('13572468', { pinModel: true }));
    // …but the REAL PIN must NEVER be cached behind Face ID in the PIN cohort.
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });
});
