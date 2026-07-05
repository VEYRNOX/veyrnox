// WalletEntry — the returning PIN screen must never auto-cache a PIN it shouldn't.
//
// CRITICAL (I3/I4). runPinUnlock auto-caches the typed PIN behind Face ID when
// biometric unlock is enabled and nothing is cached yet. Two bugs are pinned here:
//
//  1. DURESS GUARD: once a duress PIN exists, Face ID must open the DECOY only —
//     that cache is written explicitly by the Duress screen opt-in
//     (enableDecoyBiometricUnlock). If the returning screen auto-cached the typed
//     REAL PIN, one-tap Face ID would silently open the REAL wallet, defeating the
//     "Face ID = decoy, typed real PIN = real wallet" coercion design. The decision
//     is the pure shouldAutoCacheTypedPin helper; duress presence comes from
//     wallet-core hasDuressVault(). With NO duress vault, auto-caching the typed
//     (real) PIN is the SANCTIONED primary-biometric flow (see removeDuressPin's
//     re-enable path in WalletProvider) and must keep working.
//
//  2. ORDERING: the cache write must happen only AFTER unlock(pin) has SUCCEEDED.
//     The old code cached BEFORE unlocking, so a MIS-TYPED PIN was cached behind
//     Face ID (garbage cache + a spurious OS enroll prompt on a wrong PIN).
//
//  3. FAIL CLOSED: if duress presence cannot be determined (hasDuressVault throws),
//     do NOT cache — skipping the convenience cache is safe; caching a real PIN
//     next to an unknown duress state is not.
//
// We assert STRUCTURE (the enableBiometricUnlock spy), never copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
// PIN cohort; keep the REAL pure helpers (shouldAutoCacheTypedPin) exercised honestly.
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
// Cache is EMPTY (no stored secret yet) — the condition the auto-cache fires on.
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));
// Duress presence — the control under test. Default: none configured.
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => false) }));

import { useWallet } from '@/lib/WalletProvider';
import { hasDuressVault } from '@/wallet-core/duress';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
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

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

beforeEach(() => {
  vi.mocked(hasDuressVault).mockReset().mockResolvedValue(false);
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — typed-PIN auto-cache guard (duress presence + ordering)', () => {
  it('does NOT call enableBiometricUnlock when a DURESS vault is configured', async () => {
    vi.mocked(hasDuressVault).mockResolvedValue(true);
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    // The PIN must unlock the real wallet…
    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledWith('13572468', { pinModel: true }));
    // …but the typed (real) PIN must NEVER be auto-cached while duress exists.
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });

  it('auto-caches the typed PIN AFTER a successful unlock when NO duress vault exists (primary Face ID)', async () => {
    const callOrder = [];
    const ctx = makeCtx({
      unlock: vi.fn(async () => { callOrder.push('unlock'); return { ok: true }; }),
      enableBiometricUnlock: vi.fn(async () => { callOrder.push('cache'); return true; }),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.enableBiometricUnlock).toHaveBeenCalledWith('13572468'));
    // ORDERING: the unlock must have succeeded BEFORE the cache write.
    expect(callOrder).toEqual(['unlock', 'cache']);
  });

  it('does NOT cache a WRONG PIN (unlock throws → no cache write)', async () => {
    const ctx = makeCtx({
      unlock: vi.fn(async () => { throw new Error('GCM decrypt failed'); }),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });

  it('fails CLOSED: duress presence unknown (hasDuressVault throws) → no cache write', async () => {
    vi.mocked(hasDuressVault).mockRejectedValue(new Error('storage unavailable'));
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });
});
