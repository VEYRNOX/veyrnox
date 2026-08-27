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

// The availability probe REJECTS (e.g. the native bridge throws). The component
// must fail honest — render an unavailable state — not hang forever on the
// "Checking availability…" spinner (the previous silent .catch(() => {}) bug).
// NOTE: this project does not wire @testing-library/jest-dom, so we assert with
// core matchers (toBeTruthy / toBeNull) — matching the sibling kdfDisclosure test.
vi.mock('@/lib/biometric', () => ({
  isBiometricUnlockEnabled: () => false,
  setBiometricUnlockEnabled: vi.fn(),
  getBiometricStatus: () => Promise.reject(new Error('probe unavailable')),
  hasBiometricConsentBeenRecorded: () => true,
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    biometricPreview: vi.fn(),
    disableBiometricUnlock: vi.fn(),
    recordAudit: vi.fn(),
  }),
}));

describe('BiometricUnlockSettings — a failed status probe is surfaced, not swallowed', () => {
  it('renders an unavailable state instead of hanging on "Checking availability…"', async () => {
    render(<BiometricUnlockSettings />);

    // findByText throws if the element never appears — awaiting it IS the assertion
    // that the rejected probe resolved into the honest unavailable copy.
    const detail = await screen.findByText(/could not check biometric availability/i);
    expect(detail).toBeTruthy();

    // …and the loading spinner copy is gone (no permanent "Checking availability…").
    expect(screen.queryByText(/checking availability/i)).toBeNull();
  });
});
