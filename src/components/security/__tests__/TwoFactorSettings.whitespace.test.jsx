// src/components/security/__tests__/TwoFactorSettings.whitespace.test.jsx
//
// QA hardening #2 (setup side): an all-whitespace Action Password (e.g. 8 spaces)
// was accepted because the length check ran on the raw string. Trim before the
// length>=8 check so a blank AP cannot be set. This is fail-closed friendly: a
// user cannot lock themselves behind a factor that is effectively empty.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// react-i18next 15 uses its own React copy under node_modules/react-i18next/
// node_modules/react — useContext returns null there. Mock useTranslation with
// a JSON-catalog resolver (same shape as DuressPin.optin.test.jsx).
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

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TwoFactorSettings from '@/components/security/TwoFactorSettings';

vi.mock('@/api/demoClient', () => ({ DEMO: true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'password' }));

const setActionPassword = vi.fn();
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    actionPasswordConfigured: false,
    setActionPassword,
    clearActionPassword: vi.fn(),
    isDecoy: false,
    isHidden: false,
    recordAudit: vi.fn(),
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  setActionPassword.mockClear();
  if (!window.PublicKeyCredential) window.PublicKeyCredential = function () {};
});
afterEach(cleanup);

describe('TwoFactorSettings — #2 reject all-whitespace Action Password at setup', () => {
  it('8 spaces for the Action Password keeps Save disabled', () => {
    render(<TwoFactorSettings />);
    fireEvent.change(screen.getByLabelText(/wallet password/i), { target: { value: 'vault-pass-12' } });
    fireEvent.change(screen.getByLabelText(/^action password$/i), { target: { value: '        ' } });
    fireEvent.change(screen.getByLabelText(/^confirm$/i), { target: { value: '        ' } });

    const save = screen.getByRole('button', { name: /set action password/i });
    expect(save.disabled).toBe(true);
  });

  it('a real 8+ char Action Password enables Save (control)', () => {
    render(<TwoFactorSettings />);
    fireEvent.change(screen.getByLabelText(/wallet password/i), { target: { value: 'vault-pass-12' } });
    fireEvent.change(screen.getByLabelText(/^action password$/i), { target: { value: 'realsecret!!' } });
    fireEvent.change(screen.getByLabelText(/^confirm$/i), { target: { value: 'realsecret!!' } });

    const save = screen.getByRole('button', { name: /set action password/i });
    expect(save.disabled).toBe(false);
  });
});
