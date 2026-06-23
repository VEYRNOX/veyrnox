import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TwoFactorSettings from '@/components/security/TwoFactorSettings';
import {
  registerPasskeyCredential, is2faPasskeyEnabled, TWOFACTOR_PASSKEY_KEY,
} from '@/lib/passkey';

// Force the SIMULATED registration path (no real platform authenticator needed in
// jsdom) so registerPasskeyCredential just persists the public handle + fires the
// registration-changed event — exactly the path the Unlock-with-Passkey section
// drives. This is the regression under test: a passkey registered AFTER mount must
// reach TwoFactorSettings without a remount.
vi.mock('@/api/demoClient', () => ({ DEMO: true }));

// sonner's toast() needs no <Toaster/> to be called, but mocking keeps the test
// hermetic and lets us assert the guard's error copy when it fires.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    actionPasswordConfigured: false,
    setActionPassword: vi.fn(),
    clearActionPassword: vi.fn(),
    isDecoy: false,
    isHidden: false,
    recordAudit: vi.fn(),
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  // isWebAuthnSupported() gates the switch's `disabled` — make the API look present
  // so the toggle is interactive. The demo registration path never calls create().
  if (!window.PublicKeyCredential) window.PublicKeyCredential = function () {};
  Object.defineProperty(navigator, 'credentials', {
    value: { create: vi.fn(), get: vi.fn() }, configurable: true,
  });
});

describe('TwoFactorSettings — passkey registration is reactive within one mount', () => {
  it('registering a passkey then toggling enables veyrnox-2fa-passkey (no remount)', async () => {
    render(<TwoFactorSettings />);
    const toggle = screen.getByLabelText('Use passkey as my second factor');

    // No passkey yet: the toggle hits the "register a passkey first" guard and no-ops.
    fireEvent.click(toggle);
    expect(is2faPasskeyEnabled()).toBe(false);
    expect(window.localStorage.getItem(TWOFACTOR_PASSKEY_KEY)).toBeNull();

    // Register a passkey via the real lib path (simulated) — this fires the
    // registration-changed event the component now subscribes to.
    await act(async () => { await registerPasskeyCredential({ label: 'test' }); });

    // Same mount: the toggle now sees the fresh passkey and turns the factor on.
    fireEvent.click(toggle);
    expect(is2faPasskeyEnabled()).toBe(true);
    expect(window.localStorage.getItem(TWOFACTOR_PASSKEY_KEY)).toBe('1');
  });
});
