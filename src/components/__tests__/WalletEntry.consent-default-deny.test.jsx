// WalletEntry — consent screen is REMOVED (Slice F: tap reduction).
//
// Prior behaviour: first-run devices (getConsentState() === null) saw a full
// TelemetryConsent screen after unlock + past the KEK gate, before the app
// rendered. That added an extra tap on the onboarding critical path for a
// decision that already defaults to "no" everywhere else:
//   - lib/consent.js hasConsent() returns false unless the stored value is
//     exactly 'granted' (fail-closed, I4).
//   - api/trackEvent.js short-circuits on !hasConsent() before touching the
//     network or minting a device id (I2).
// Deleting the WalletEntry render branch therefore does NOT weaken privacy:
// telemetry stays OFF by default; the Settings → Privacy toggle remains the
// single opt-in path.
//
// These tests pin the STRUCTURE of that change:
//   1. First-run device: consent modal must NOT render, app renders instead.
//   2. Mount must not implicitly write consent (no setConsent call).
//   3. trackEvent() must silently no-op while consent is absent.
//   4. Settings toggle (setConsent) still works as the opt-in path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

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

// Consent module: never-answered state; spy on setConsent so tests can assert
// that mount does NOT implicitly write consent.
const setConsent = vi.fn();
const getConsentState = vi.fn(() => null);
vi.mock('@/lib/consent', () => ({
  getConsentState: (...a) => getConsentState(...a),
  hasConsent: () => getConsentState() === 'granted',
  clearConsent: vi.fn(),
  setConsent: (...a) => setConsent(...a),
}));

// If the consent screen ever DID render, this stub would show a test-id we can
// assert on. After the fix the branch is gone, so this stub should never be
// mounted.
vi.mock('@/components/TelemetryConsent', () => ({
  default: () => <div data-testid="telemetry-consent-screen">consent-screen</div>,
}));

// Web path so KEK gate does not intercept — first-run flow on desktop is the
// simplest surface for this assertion.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
}));

const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
  isDeniabilitySessionActive: vi.fn(() => false),
}));

// trackEvent's RPC layer — spy so we can assert the no-op behaviour without
// hitting network.
const rpc = vi.fn(async () => ({}));
vi.mock('@/api/edgeApi', () => ({ rpc: (...a) => rpc(...a) }));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

import { useWallet } from '@/lib/WalletProvider';
import WalletEntry from '@/components/WalletEntry';
import { trackEvent, EVENT } from '@/api/trackEvent';

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

beforeEach(() => {
  isDeniabilityOrDemoActive.mockReturnValue(false);
  getConsentState.mockReturnValue(null);
  setConsent.mockClear();
  rpc.mockClear();
  try { localStorage.clear(); } catch { /* shimmed */ }
});
afterEach(() => { cleanup(); });

describe('WalletEntry — consent screen removed, default-deny preserved', () => {
  it('1. first-run device (never answered) does NOT render TelemetryConsent', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    // App renders past WalletEntry — Outlet is reached.
    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    // The consent screen must never mount.
    expect(screen.queryByTestId('telemetry-consent-screen')).toBeNull();
  });

  it('2. mount does not implicitly write consent (setConsent never called)', async () => {
    vi.mocked(useWallet).mockReturnValue(makeCtx());
    renderEntry();

    await waitFor(() => expect(screen.getByText(APP_MARKER)).toBeTruthy());
    // getConsentState still null → nothing wrote a decision on mount.
    expect(getConsentState()).toBeNull();
    expect(setConsent).not.toHaveBeenCalled();
  });

  it('3. trackEvent silently no-ops when consent is absent (fail-closed)', async () => {
    // hasConsent() derives from getConsentState() === 'granted' — currently null.
    const result = await trackEvent(EVENT.SESSION_START, {});
    expect(result).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('4. Settings-toggle path still opts in via setConsent()', async () => {
    // Unmock the consent module for this one assertion by calling the real one
    // via dynamic import — the top-level mock replaces the module for the SUT,
    // but the test can verify the real accessors independently.
    vi.doUnmock('@/lib/consent');
    vi.resetModules();
    const real = await import('@/lib/consent');
    try { localStorage.removeItem(real.CONSENT_KEY); } catch { /* shimmed */ }
    expect(real.getConsentState()).toBeNull();
    expect(real.hasConsent()).toBe(false);

    real.setConsent(true);
    expect(real.getConsentState()).toBe('granted');
    expect(real.hasConsent()).toBe(true);
    try { localStorage.removeItem(real.CONSENT_KEY); } catch { /* shimmed */ }
  });
});
