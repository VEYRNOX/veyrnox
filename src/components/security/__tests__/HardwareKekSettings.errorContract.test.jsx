// src/components/security/__tests__/HardwareKekSettings.errorContract.test.jsx
//
// QA I/O-validation (MED) — the settings card classified failures by PROSE-MATCHING
// the error message (msg.toLowerCase().includes('password') / includes('UNWRAP')),
// and the final else rendered the RAW `${msg}`. Copy is not a contract and a raw
// message can leak internals. This pins:
//   (a) classification by e.code against the KEK_ERR codes (UNWRAP_FAILED /
//       NO_HARDWARE_FACTOR → "Wrong PIN…" style guidance);
//   (b) the generic fallback renders a GENERIC message, never the raw thrown text;
//   (c) a11y: the error node carries role="alert" and the busy node role="status".
//
// getKeyStore / hardware.js / web.js are mocked so no real crypto runs.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

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

// Force the WEB branch (isNative=false) — deterministic and no native plugin.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const mockRecordAudit = vi.fn();
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, recordAudit: mockRecordAudit }),
}));

const enrollKekFn = vi.fn(async () => {});
const unenrollKekFn = vi.fn(async () => {});
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({ enrollKek: enrollKekFn, unenrollKek: unenrollKekFn, hasVaultKekWrap: async () => false }),
}));

const webKeyStoreMock = {
  isHardwareKeystoreAvailable: vi.fn(async () => true),
  isHardwareEnrolled: vi.fn(async () => false),
  getHardwareFactor: vi.fn(async () => new Uint8Array(32)),
  enrollKek: enrollKekFn,
  unenrollKek: unenrollKekFn,
};
vi.mock('@/wallet-core/keystore/web.js', () => ({ webKeyStore: webKeyStoreMock }));

// PinPad: minimal stub exposing a submit button that calls onComplete(value).
vi.mock('@/components/security/PinPad', () => ({
  default: ({ onComplete, submitLabel }) => (
    <button onClick={() => onComplete('123456789012')}>{submitLabel}</button>
  ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { KEK_ERR } = await import('@/wallet-core/keystore/kek.js');
const HardwareKekSettings = (await import('@/components/security/HardwareKekSettings')).default;

async function renderSettled() {
  await act(async () => { render(<HardwareKekSettings />); });
}

function codeErr(code) {
  return Object.assign(new Error('some internal detail that must not leak'), { code });
}

beforeEach(() => { vi.clearAllMocks(); webKeyStoreMock.isHardwareEnrolled.mockResolvedValue(false); });
afterEach(() => cleanup());

describe('error classification by code (not prose)', () => {
  it('NO_HARDWARE_FACTOR code → hardware-specific message, not the raw internal text', async () => {
    enrollKekFn.mockRejectedValueOnce(codeErr(KEK_ERR.NO_HARDWARE_FACTOR));
    await renderSettled();
    await act(async () => { fireEvent.click(screen.getByText('Enable hardware protection')); });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/hardware/i);
    expect(alert.textContent).not.toMatch(/internal detail/i);
  });

  it('UNWRAP_FAILED code on removal → PIN guidance, not the raw message', async () => {
    webKeyStoreMock.isHardwareEnrolled.mockResolvedValue(true);
    unenrollKekFn.mockRejectedValueOnce(codeErr(KEK_ERR.UNWRAP_FAILED));
    await renderSettled();
    await act(async () => { fireEvent.click(screen.getByText('Remove hardware protection')); });
    await act(async () => { fireEvent.click(screen.getByText('Remove hardware protection')); });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/PIN/i);
    expect(alert.textContent).not.toMatch(/internal detail/i);
  });

  it('an unclassified error renders a GENERIC message, never the raw thrown text', async () => {
    enrollKekFn.mockRejectedValueOnce(new Error('RAW_SECRET_LEAKING_INTERNAL_XYZ'));
    await renderSettled();
    await act(async () => { fireEvent.click(screen.getByText('Enable hardware protection')); });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/RAW_SECRET_LEAKING_INTERNAL_XYZ/);
    expect(alert.textContent.length).toBeGreaterThan(0);
  });
});

describe('a11y — screen-reader announcements', () => {
  it('the error node has role="alert"', async () => {
    enrollKekFn.mockRejectedValueOnce(new Error('boom'));
    await renderSettled();
    await act(async () => { fireEvent.click(screen.getByText('Enable hardware protection')); });
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('the busy indicator has role="status"', async () => {
    let resolveEnroll;
    enrollKekFn.mockImplementationOnce(() => new Promise(r => { resolveEnroll = r; }));
    await renderSettled();
    await act(async () => { fireEvent.click(screen.getByText('Enable hardware protection')); });
    expect(await screen.findByRole('status')).toBeTruthy();
    await act(async () => { resolveEnroll(); });
  });
});
