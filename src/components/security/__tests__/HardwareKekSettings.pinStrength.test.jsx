// src/components/security/__tests__/HardwareKekSettings.pinStrength.test.jsx
//
// M-9 in-app PIN strength disclosure.
// Pins that the correct PinStrengthNotice variant renders in each state:
//   (a) pre-enroll native or web+PRF → 'pin-strength-pre-enroll'
//   (b) enrolled (any platform)      → 'pin-strength-hardware'
//   (c) web + no PRF (Safari)        → 'pin-strength-no-hardware'
//
// No real crypto runs; getKeyStore / web.js / hardware.js are all mocked.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

// react-i18next 15 uses its own React copy under node_modules/react-i18next/
// node_modules/react — useContext returns null there. Mock useTranslation with a
// JSON-catalog resolver (same shape as DuressPin.optin.test.jsx).
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, recordAudit: vi.fn() }),
}));
vi.mock('@/components/security/PinPad', () => ({
  default: ({ submitLabel }) => <button>{submitLabel}</button>,
}));
vi.mock('@/wallet-core/keystore/tierBadge.js', () => ({
  tierToBadge: () => ({ label: 'Hardware Protection ON', variant: 'success' }),
}));

afterEach(() => { cleanup(); vi.resetModules(); });

// ── helper factories ──────────────────────────────────────────────────────────
function makeWebKeyStoreMock({ available = true, enrolled = false } = {}) {
  return {
    isHardwareKeystoreAvailable: vi.fn(async () => available),
    isHardwareEnrolled: vi.fn(async () => enrolled),
    getHardwareFactor: vi.fn(async () => new Uint8Array(32)),
    enrollKek: vi.fn(async () => {}),
    unenrollKek: vi.fn(async () => {}),
  };
}

function makeKeyStoreMock({ wrapped = false, enrolled = false } = {}) {
  return {
    enrollKek: vi.fn(async () => {}),
    unenrollKek: vi.fn(async () => {}),
    hasVaultKekWrap: vi.fn(async () => wrapped),
    getVaultKekTier: vi.fn(async () => 'STRONGBOX'),
    getVaultKekVersion: vi.fn(async () => 3),
    isEnrolled: vi.fn(async () => enrolled),
  };
}

// ── (a) pre-enroll: web + PRF available, not yet enrolled ───────────────────
describe('PinStrengthNotice: pre-enroll variant', () => {
  it('renders pin-strength-pre-enroll when web+PRF available and not enrolled', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    vi.doMock('@/wallet-core/keystore/web.js', () => ({
      webKeyStore: makeWebKeyStoreMock({ available: true, enrolled: false }),
    }));
    vi.doMock('@/wallet-core/keystore', () => ({
      getKeyStore: () => makeKeyStoreMock({ wrapped: false }),
    }));

    const { default: HardwareKekSettings } = await import('@/components/security/HardwareKekSettings');
    await act(async () => { render(<HardwareKekSettings />); });

    expect(screen.getByTestId('pin-strength-pre-enroll')).toBeTruthy();
    expect(screen.queryByTestId('pin-strength-hardware')).toBeNull();
    expect(screen.queryByTestId('pin-strength-no-hardware')).toBeNull();
  });
});

// ── (b) enrolled: hardware notice shown ──────────────────────────────────────
describe('PinStrengthNotice: hardware variant', () => {
  it('renders pin-strength-hardware when web+PRF enrolled', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    vi.doMock('@/wallet-core/keystore/web.js', () => ({
      webKeyStore: makeWebKeyStoreMock({ available: true, enrolled: true }),
    }));
    vi.doMock('@/wallet-core/keystore', () => ({
      getKeyStore: () => makeKeyStoreMock({ wrapped: true }),
    }));

    const { default: HardwareKekSettings } = await import('@/components/security/HardwareKekSettings');
    await act(async () => { render(<HardwareKekSettings />); });

    expect(screen.getByTestId('pin-strength-hardware')).toBeTruthy();
    expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeNull();
    expect(screen.queryByTestId('pin-strength-no-hardware')).toBeNull();
  });
});

// ── (c) no PRF (Safari): amber no-hardware warning shown ─────────────────────
describe('PinStrengthNotice: no-hardware variant', () => {
  it('renders pin-strength-no-hardware when PRF unavailable', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    vi.doMock('@/wallet-core/keystore/web.js', () => ({
      webKeyStore: makeWebKeyStoreMock({ available: false, enrolled: false }),
    }));
    vi.doMock('@/wallet-core/keystore', () => ({
      getKeyStore: () => makeKeyStoreMock({ wrapped: false }),
    }));

    const { default: HardwareKekSettings } = await import('@/components/security/HardwareKekSettings');
    await act(async () => { render(<HardwareKekSettings />); });

    expect(screen.getByTestId('pin-strength-no-hardware')).toBeTruthy();
    expect(screen.queryByTestId('pin-strength-pre-enroll')).toBeNull();
    expect(screen.queryByTestId('pin-strength-hardware')).toBeNull();
  });

  it('no-hardware notice mentions 12+ characters', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    vi.doMock('@/wallet-core/keystore/web.js', () => ({
      webKeyStore: makeWebKeyStoreMock({ available: false, enrolled: false }),
    }));
    vi.doMock('@/wallet-core/keystore', () => ({
      getKeyStore: () => makeKeyStoreMock({ wrapped: false }),
    }));

    const { default: HardwareKekSettings } = await import('@/components/security/HardwareKekSettings');
    await act(async () => { render(<HardwareKekSettings />); });

    const notice = screen.getByTestId('pin-strength-no-hardware');
    expect(notice.textContent).toMatch(/12\+\s*char/i);
  });
});
