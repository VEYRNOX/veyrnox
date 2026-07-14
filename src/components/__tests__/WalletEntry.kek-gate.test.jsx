// WalletEntry — mandatory hardware-KEK enrollment gate after seed restore.
//
// After delete+reinstall+seed-restore on a native device, the SE/StrongBox key is
// gone: the user lands in an unlocked wallet with NO hardware protection. The app
// must intercept BEFORE rendering the main wallet (<Outlet>) and prompt enrollment.
//
// The single convergence point for ALL import paths (PIN cohort, PIN recovery,
// password cohort) is WalletEntry's `if (isUnlocked && !generatedSeed) return
// <Outlet />`. A `kekGatePending` hold is added there.
//
// These tests pin the GATE DECISION (does the interstitial render, or does the app
// render behind it?) and the clear paths (onComplete / onSkip). We assert on
// STRUCTURE (gate testid vs. app-content marker), never on copy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('@/lib/authModel', async (orig) => {
  const real = await orig();
  return { ...real, getAuthModel: vi.fn(() => 'pin'), setAuthModel: vi.fn() };
});
vi.mock('@/lib/biometric', () => ({
  isBiometricGateError: vi.fn(() => false),
  isBiometricUnlockEnabled: vi.fn(() => false),
  getBiometricStatus: vi.fn(async () => ({ available: false, label: '', mode: 'none' })),
}));
vi.mock('@/lib/biometricUnlock', () => ({
  hasStoredUnlockSecret: vi.fn(async () => false),
  clearUnlockSecret: vi.fn(async () => {}),
}));
vi.mock('@/lib/passkey', () => ({ isPasskeyGateError: vi.fn(() => false) }));

// Native by default; individual tests flip this for the web case.
const isNativePlatform = vi.fn(() => true);
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
  registerPlugin: vi.fn(() => ({})),
}));

// Deniability / demo guard.
const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
  isDeniabilitySessionActive: vi.fn(() => false),
}));

// Keystore facade — the local read surface the gate uses. Realistic stub behaviour:
// isSecureHardwareAvailable() reports whether the device has a usable secure element,
// hasVaultKekWrap() reports whether the current vault is already KEK-wrapped, and
// enrollKek() writes the wrap. No fake "success" — enrollKek only resolves when
// called with a real PIN + a getHardwareFactor.
const keyStoreStub = {
  isSecureHardwareAvailable: vi.fn(async () => true),
  hasVaultKekWrap: vi.fn(async () => false),
  enrollKek: vi.fn(async (pin, opts) => {
    if (!pin) throw Object.assign(new Error('WRONG_PASSWORD'), { code: 'WRONG_PASSWORD' });
    if (!opts || typeof opts.getHardwareFactor !== 'function') {
      throw Object.assign(new Error('KEK_NO_HARDWARE_FACTOR'), { code: 'KEK_NO_HARDWARE_FACTOR' });
    }
    return undefined;
  }),
};
vi.mock('@/wallet-core/keystore', async (orig) => {
  const real = await orig();
  return { ...real, getKeyStore: vi.fn(() => keyStoreStub) };
});

// Native hardware facade — enrollHardwareCredential prompts biometric + returns the
// real security tier; getHardwareFactor is the per-use hardware factor fn. Stubbed
// with realistic behaviour, NOT mocked to "look real": enroll returns a genuine tier
// object and getHardwareFactor is a real callable the gate binds into enrollKek.
const enrollHardwareCredential = vi.fn(async () => ({
  securityLevel: 2,
  securityLevelName: 'STRONGBOX',
}));
const getHardwareFactor = vi.fn(async () => new Uint8Array(32).fill(7));
vi.mock('@/wallet-core/keystore/hardware.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    enrollHardwareCredential: (...a) => enrollHardwareCredential(...a),
    getHardwareFactor: (...a) => getHardwareFactor(...a),
  };
});

import { useWallet } from '@/lib/WalletProvider';
import WalletEntry from '@/components/WalletEntry';

function makeCtx(overrides = {}) {
  return {
    isUnlocked: true, isDecoy: false,
    hasVault: vi.fn(async () => true),
    unlock: vi.fn(async () => ({ ok: true })),
    panicWipe: vi.fn(async () => ({ clean: true })),
    createWallet: vi.fn(), importWallet: vi.fn(),
    enableBiometricUnlock: vi.fn(async () => true), unlockWithBiometric: vi.fn(),
    exploreMode: false, enterExplore: vi.fn(), leaveExplore: vi.fn(),
    confirmWalletBackup: vi.fn(), setupPin: vi.fn(),
    createWalletFromPendingPin: vi.fn(), importWalletForPendingPin: vi.fn(),
    clearPendingPin: vi.fn(), hasPendingPin: false,
    wasWiped: false, acknowledgeWipe: vi.fn(),
    clearVault: vi.fn(), validateMnemonic: vi.fn(),
    ...overrides,
  };
}

const APP_MARKER = 'APP-CONTENT-BEHIND-OUTLET';

function renderEntry() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<WalletEntry />}>
          <Route index element={<div>{APP_MARKER}</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const GATE_TESTID = 'kek-enrollment-gate';

beforeEach(() => {
  isNativePlatform.mockReturnValue(true);
  isDeniabilityOrDemoActive.mockReturnValue(false);
  keyStoreStub.isSecureHardwareAvailable.mockResolvedValue(true);
  keyStoreStub.hasVaultKekWrap.mockResolvedValue(false);
  keyStoreStub.enrollKek.mockClear();
  enrollHardwareCredential.mockClear();
  getHardwareFactor.mockClear();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — hardware-KEK enrollment gate after restore', () => {
  it('1. native + hardware available + no vault wrap → gate holds, <Outlet> NOT rendered', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());
    expect(screen.queryByText(APP_MARKER)).toBeNull();
  });

  it('2. hardware NOT available → gate does NOT fire, <Outlet> renders', async () => {
    keyStoreStub.isSecureHardwareAvailable.mockResolvedValue(false);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
  });

  it('3. vault already wrapped → gate does NOT fire, <Outlet> renders', async () => {
    keyStoreStub.hasVaultKekWrap.mockResolvedValue(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
  });

  it('4. demo/deniability session → gate does NOT fire, <Outlet> renders', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
  });

  it('5. web (isNativePlatform false) → gate does NOT fire, <Outlet> renders', async () => {
    isNativePlatform.mockReturnValue(false);
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
  });

  it('6. successful enrollment → onComplete clears the gate → <Outlet> renders', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());

    // The "Enable Hardware Protection" affordance is the PinPad submit (its visible
    // label); its accessible name is the stable "Submit PIN".
    expect(screen.getByText(/enable hardware protection/i)).toBeTruthy();
    // Enter the PIN (needed for enrollKek) then submit to enable hardware protection.
    for (const d of '13572468') fireEvent.click(screen.getByRole('button', { name: d }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PIN' }));

    // Real enroll path was exercised with the typed PIN + bound hardware factor.
    await waitFor(() => expect(keyStoreStub.enrollKek).toHaveBeenCalled());
    expect(keyStoreStub.enrollKek.mock.calls[0][0]).toBe('13572468');
    expect(typeof keyStoreStub.enrollKek.mock.calls[0][1].getHardwareFactor).toBe('function');

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
  });

  it('7. explicit skip → onSkip clears the gate → <Outlet> renders', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByTestId(GATE_TESTID)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    expect(screen.queryByTestId(GATE_TESTID)).toBeNull();
    // Skip must NOT silently enroll.
    expect(keyStoreStub.enrollKek).not.toHaveBeenCalled();
  });
});
