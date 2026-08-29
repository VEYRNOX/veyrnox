// Smallest check that fails if the previously-ineligible retry path breaks.
// Regression guards:
//   (a) with veyrnox-kek-insecure-tier='1' set, the not-enrolled native branch
//       renders the caution banner (kek-previously-ineligible testid); without
//       the flag it does not.
//   (b) a successful native enroll clears the persisted verdict so the
//       useKekEnrollmentGate unlock gate is no longer suppressed.
// The banner + clear-on-success are the whole point of the toggle — if either
// silently breaks, Chinese-OEM users lose either the affordance or the reset.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';

vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const bundles = { wallet: wallet.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'wallet';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (opts.returnObjects) return v ?? [];
    if (typeof v !== 'string') return key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return {
    useTranslation: (ns) => ({ t: (k, o) => resolve(k, { ns, ...(o || {}) }) }),
    Trans: ({ children }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }) => children,
  };
});

// Force NATIVE branch — the banner + clear-on-success paths are native-only.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, recordAudit: vi.fn() }),
}));

const enrollKek = vi.fn(async () => {});
const refreshNativeSecuritySnapshot = vi.fn(async () => ({
  platform: 'android',
  manufacturer: 'OnePlus',
  model: 'OnePlus 15',
  sdkInt: 36,
  hardwareBacking: 'tee',
  biometryEnrolled: true,
  biometricAvailable: true,
  deviceIsSecure: true,
  secureHardwareAvailable: true,
}));
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    enrollKek,
    hasVaultKekWrap: async () => false,
    getVaultKekTier: async () => 'STRONGBOX',
    getVaultKekVersion: async () => 3,
    refreshNativeSecuritySnapshot,
    getNativeSecuritySnapshot: async () => ({
      platform: 'android',
      manufacturer: 'OnePlus',
      model: 'OnePlus 15',
      sdkInt: 36,
      hardwareBacking: 'tee',
      biometryEnrolled: true,
      biometricAvailable: true,
      deviceIsSecure: true,
      secureHardwareAvailable: true,
    }),
  }),
}));

vi.mock('@/wallet-core/keystore/hardware.js', () => ({
  enrollHardwareCredential: vi.fn(async () => ({ securityLevelName: 'STRONGBOX' })),
  isHardwareEnrolled: vi.fn(async () => false),
  clearHardwareCredential: vi.fn(async () => {}),
  getHardwareFactor: vi.fn(async () => new Uint8Array(32)),
}));

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import HardwareKekSettings from '../HardwareKekSettings';
import { KEK_INSECURE_TIER_KEY } from '@/lib/useKekEnrollmentGate';

describe('HardwareKekSettings — previously-ineligible retry', () => {
beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders the caution banner only when the ineligible verdict is persisted', async () => {
    // No flag → no banner.
    render(<HardwareKekSettings />);
    await waitFor(() => expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeTruthy());
    expect(screen.queryByTestId('kek-previously-ineligible')).toBeNull();
    cleanup();

    // Flag set → banner renders.
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    render(<HardwareKekSettings />);
    await waitFor(() => expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeTruthy());
    expect(screen.getByTestId('kek-previously-ineligible')).toBeTruthy();
  });

  it('renders the native compatibility snapshot for vendor Android devices', async () => {
    render(<HardwareKekSettings />);
    expect(await screen.findByTestId('android-security-snapshot')).toBeTruthy();
    expect(screen.getByText('OnePlus OnePlus 15')).toBeTruthy();
    expect(screen.getByText('TEE')).toBeTruthy();
    expect(screen.getByText(/TEE-backed Android devices are supported/i)).toBeTruthy();
  });

  it('clears the ineligible verdict on successful native enroll', async () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    const { container } = render(<HardwareKekSettings />);
    await waitFor(() => expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeTruthy());
    // Trigger the enroll handler directly — PinPad interaction is out of scope
    // for this regression guard; we care about the flag-clear side effect.
    // Codex P1 2026-08-15: previous fallback branch imported
    // clearKekInsecureTier() and called it directly, then asserted the flag
    // was null — the test cleared the flag itself and then confirmed it had
    // cleared, exercising ZERO component code. Worse, the `if (submit)` guard
    // used a data-testid selector the PinPad has never exposed
    // (src/components/security/PinPad.jsx uses aria-label, not data-testid),
    // so the fallback was ALWAYS taken. Drive the real PinPad DOM instead.
    const submit = screen.getByRole('button', { name: /^Submit PIN$/ });
    // Digit buttons render as <button>N</button> with no aria-label — text is
    // the accessible name. Pick "1" and press 8 times to satisfy the length.
    const digitOne = screen.getByRole('button', { name: '1', exact: true });
    for (let i = 0; i < 8; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { digitOne.click(); });
    }
    await act(async () => { submit.click(); });
    await waitFor(() => {
      expect(enrollKek).toHaveBeenCalled();
      expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe(null);
    });
  });

  it('retests device security and clears the persisted verdict when compatibility improves', async () => {
    localStorage.setItem(KEK_INSECURE_TIER_KEY, '1');
    render(<HardwareKekSettings />);
    await waitFor(() => expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeTruthy());

    await act(async () => {
      screen.getByRole('button', { name: 'Retest device security' }).click();
    });

    await waitFor(() => {
      expect(refreshNativeSecuritySnapshot).toHaveBeenCalled();
      expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe(null);
    });
  });
});
