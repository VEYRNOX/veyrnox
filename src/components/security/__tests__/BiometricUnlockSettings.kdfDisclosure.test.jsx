import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BiometricUnlockSettings from '@/components/security/BiometricUnlockSettings';

// react-i18next 15 uses its own React copy under node_modules/react-i18next/
// node_modules/react — useContext returns null there. Mock useTranslation
// with a JSON-catalog resolver (same shape as RaspSecurity / PanicWipe tests).
vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { wallet: wallet.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
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

vi.mock('@/lib/biometric', () => ({
  isBiometricUnlockEnabled: () => false,
  setBiometricUnlockEnabled: vi.fn(),
  getBiometricStatus: () => Promise.resolve({ available: false, detail: 'Not available', mode: 'demo', simulated: false }),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    biometricPreview: vi.fn(),
    disableBiometricUnlock: vi.fn(),
    recordAudit: vi.fn(),
  }),
}));

describe('BiometricUnlockSettings KDF-bypass disclosure (VULN-1)', () => {
  it('renders a KDF-bypass disclosure element', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    expect(els.length).toBeGreaterThan(0);
  });

  it('disclosure mentions that the wallet password is stored on the device', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/wallet password/);
    expect(el.textContent.toLowerCase()).toMatch(/device/);
  });

  it('disclosure mentions the risk of backup extraction', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/backup|protection/);
  });
});
