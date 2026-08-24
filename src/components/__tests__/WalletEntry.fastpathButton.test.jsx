// WalletEntry — fast-path biometric unlock BUTTON above the PIN keypad (#2019 UI).
//
// The button is a PARALLEL entry to the existing PIN pad, gated by four ANDs:
//   - Capacitor.getPlatform() === 'android'
//   - isFastpathEnabled() (opt-in toggle, default OFF)
//   - checkBiometry().isAvailable
//   - not deniability/demo (I3 chokepoint)
//
// Missing ANY gate → the button MUST NOT render (fail-closed visibility).
// On tap, it calls unlockBiometricOnly(); on { fallbackToPin:true } the PIN pad
// stays visible so the user can type their PIN (I4 fail-closed).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', async (orig) => {
  const real = await orig();
  return { ...real, getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() };
});
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  setBiometricUnlockEnabled: vi.fn(() => {}),
  getBiometricStatus: vi.fn(async () => ({ available: true, label: 'Fingerprint', mode: 'native' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
const isPasskeyRegisteredMock = vi.fn(() => false);
vi.mock('@/lib/passkey', () => ({
  isPasskeyGateError: vi.fn(() => false),
  isPasskeyRegistered: (...a) => isPasskeyRegisteredMock(...a),
  PASSKEY_GATE_MESSAGES: {},
  PASSKEY_ESCAPE_HATCH_BLURBS: {},
}));
vi.mock('@/wallet-core/duress', () => ({ hasDuressVault: vi.fn(async () => true) }));

// ANDROID native platform.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }));

// The real fastpathUnlock module respects deniability at the WRITE — reads are
// ungated and return true/false based on the flag key.
import { FASTPATH_ENABLED_STORAGE_KEY } from '@/lib/fastpathUnlock';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import { useWallet } from '@/lib/WalletProvider';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: false, isDecoy: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(async () => ({ ok: true })),
    unlockBiometricOnly: vi.fn(async () => ({ ok: true })),
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

async function waitForPinPad() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy());
}

const FASTPATH_BUTTON_TESTID = 'fastpath-unlock-button';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  // Native + vault + missing auth-model marker routes to 'vault-desync' (see
  // WalletEntry hasVault effect). Set the marker so we reach the 'unlock' view.
  try { localStorage.setItem('veyrnox-auth-model', 'pin'); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  isPasskeyRegisteredMock.mockReturnValue(false);
});
afterEach(() => { cleanup(); setDeniabilitySession(false); });

describe('WalletEntry — fast-path biometric button visibility matrix', () => {
  it('all gates pass on Android + PIN cohort → button rendered above PIN pad', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.getByTestId(FASTPATH_BUTTON_TESTID)).toBeTruthy();
  });

  it('fastpath opt-in OFF → button hidden (default behaviour)', async () => {
    // No localStorage flag set — isFastpathEnabled() returns false.
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it('decoy session → button hidden (I3 chokepoint)', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    setDeniabilitySession(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx({ isDecoy: true }));
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it('passkey registered → button hidden (owner ruling — passkey stays the sole biometric-adjacent factor)', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    isPasskeyRegisteredMock.mockReturnValue(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    expect(screen.queryByTestId(FASTPATH_BUTTON_TESTID)).toBeNull();
  });

  it('tap → invokes unlockBiometricOnly() (parallel to PIN, no password argument)', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    const ctx = makeCtx();
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await act(async () => {
      fireEvent.click(screen.getByTestId(FASTPATH_BUTTON_TESTID));
    });
    await waitFor(() => expect(ctx.unlockBiometricOnly).toHaveBeenCalledTimes(1));
    // First arg must NOT be a string (no password ever passes through this branch).
    const arg0 = ctx.unlockBiometricOnly.mock.calls[0][0];
    expect(typeof arg0).not.toBe('string');
  });

  it('fallbackToPin → PIN keypad stays visible (I4 fail-closed)', async () => {
    localStorage.setItem(FASTPATH_ENABLED_STORAGE_KEY, '1');
    const ctx = makeCtx({
      unlockBiometricOnly: vi.fn(async () => ({ ok: false, fallbackToPin: true, code: 'FASTPATH_MISS' })),
    });
    vi.mocked(useWallet).mockReturnValue(ctx);
    render(<MemoryRouter><WalletEntry /></MemoryRouter>);
    await waitForPinPad();
    await act(async () => {
      fireEvent.click(screen.getByTestId(FASTPATH_BUTTON_TESTID));
    });
    await waitFor(() => expect(ctx.unlockBiometricOnly).toHaveBeenCalled());
    // The PIN pad remains available so the user can complete unlock the normal way.
    expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeTruthy();
  });
});
