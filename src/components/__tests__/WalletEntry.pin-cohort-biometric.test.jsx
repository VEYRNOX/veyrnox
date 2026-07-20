// WalletEntry — the returning PIN screen must never auto-cache a PIN it shouldn't.
//
// CRITICAL (I3/I4). runPinUnlock auto-caches the typed PIN behind Face ID when
// biometric unlock is enabled and nothing is cached yet. Bugs pinned here:
//
//  1. DECOY-CACHE GUARD: if Face ID→decoy was opted into (enableDecoyBiometricUnlock),
//     the biometric cache already holds the DURESS PIN. The auto-cache must NEVER
//     overwrite it — that's the `alreadyCached` check in shouldAutoCacheTypedPin.
//     With NO cached secret, auto-caching the typed (real) PIN is the SANCTIONED
//     primary-biometric flow.
//
//  2. ORDERING: the cache write must happen only AFTER unlock(pin) has SUCCEEDED.
//     The old code cached BEFORE unlocking, so a MIS-TYPED PIN was cached behind
//     Face ID (garbage cache + a spurious OS enroll prompt on a wrong PIN).
//
//  3. CHAFF COMPATIBILITY: every PIN-cohort device provisions chaff into the duress
//     IndexedDB slot at onboarding (provisionChaff.js), so hasDuressVault() ALWAYS
//     returns true. The auto-cache must NOT be blocked by chaff — it uses
//     alreadyCached (biometric cache presence), not hasDuressVault (blob presence).
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
  setBiometricUnlockEnabled: vi.fn(() => {}),
  getBiometricStatus: vi.fn(async () => ({ available: true, label: 'Face ID', mode: 'native' })),
}));
// Cache is EMPTY (no stored secret yet) — the condition the auto-cache fires on.
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));
// Duress blob always exists (chaff from provisionChaff.js).
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => true) }));

import { useWallet } from '@/lib/WalletProvider';
import { hasStoredUnlockSecret, clearUnlockSecret } from '@/lib/biometricUnlock';
import { setBiometricUnlockEnabled } from '@/lib/biometric';
import { DURESS_CONFIGURED_KEY, DECOY_BIOMETRIC_MARKER_KEY } from '@/lib/duressBiometricGuard';
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
  vi.mocked(hasStoredUnlockSecret).mockReset().mockResolvedValue(false);
  vi.mocked(clearUnlockSecret).mockClear();
  vi.mocked(setBiometricUnlockEnabled).mockClear();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — typed-PIN auto-cache guard (ordering + chaff compat)', () => {
  it('auto-caches the typed PIN AFTER a successful unlock even with chaff duress blob (primary Face ID)', async () => {
    // hasDuressVault returns true (chaff), but auto-cache must still fire because
    // the biometric cache is empty (alreadyCached: false). This is the chaff-compat fix.
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

  it('does NOT overwrite an existing decoy biometric cache (alreadyCached guard)', async () => {
    // If the user opted into Face ID→decoy, the cache holds the duress PIN.
    // Auto-cache must NOT overwrite it with the real PIN.
    vi.mocked(hasStoredUnlockSecret).mockResolvedValue(true);
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalledWith('13572468', { pinModel: true, skipBiometric: true }));
    // The typed (real) PIN must NEVER be auto-cached when a secret already exists.
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });

  // ---- H-3 / P1-B: while a duress PIN is configured, the REAL pin is never cached ----
  it('does NOT auto-cache the typed REAL pin while a duress PIN is CONFIGURED', async () => {
    // Pre-state: the user deliberately configured an Emergency PIN (the marker the
    // Emergency-PIN screen writes), biometric pref is on, cache is empty. Without the
    // duress guard, this successful real-PIN unlock re-arms "Face ID opens the REAL
    // wallet" and re-creates H-3.
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    // The cache is decoy-bound, so the mount guard leaves the arming alone; the ONLY
    // thing that must stop the re-cache here is the shouldAutoCacheTypedPin guard.
    localStorage.setItem(DECOY_BIOMETRIC_MARKER_KEY, '1');
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.unlock).toHaveBeenCalled());
    expect(ctx.enableBiometricUnlock).not.toHaveBeenCalled();
  });

  it('still auto-caches when NO duress PIN is configured (no PR #714 regression)', async () => {
    // Chaff writes a duress BLOB on every PIN device, but no configuration marker —
    // the guard must key on the marker, never on blob presence.
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await enterPin();

    await waitFor(() => expect(ctx.enableBiometricUnlock).toHaveBeenCalledWith('13572468'));
  });

  // ---- H-3 / P1-A: the installed-base guard runs on cold lock-screen mount ----
  it('disarms a pre-existing duress + armed-biometric device on mount (installed base)', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1'); // configured BEFORE the H-3 fix
    vi.mocked(hasStoredUnlockSecret).mockResolvedValue(true); // holds the REAL pin
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    await waitFor(() => expect(setBiometricUnlockEnabled).toHaveBeenCalledWith(false));
    expect(clearUnlockSecret).toHaveBeenCalled();
  });

  it('leaves a decoy-bound biometric cache armed on mount', async () => {
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    localStorage.setItem(DECOY_BIOMETRIC_MARKER_KEY, '1');
    vi.mocked(hasStoredUnlockSecret).mockResolvedValue(true);
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);

    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();

    expect(setBiometricUnlockEnabled).not.toHaveBeenCalled();
    expect(clearUnlockSecret).not.toHaveBeenCalled();
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
});
