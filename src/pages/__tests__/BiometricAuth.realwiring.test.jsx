import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import BiometricAuth from '@/pages/BiometricAuth';
import {
  is2faPasskeyEnabled, isPasskeyRegistered, TWOFACTOR_PASSKEY_KEY,
} from '@/lib/passkey';

// Force the SIMULATED registration path (no real platform authenticator in jsdom),
// exactly like TwoFactorSettings.passkeyReactive.test.jsx. registerPasskeyCredential
// then just persists the public handle + fires the registration-changed event.
vi.mock('@/api/demoClient', () => ({ DEMO: true }));

const passkeyPreview = vi.fn(async () => true);
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ passkeyPreview: (...a) => passkeyPreview(...a), recordAudit: vi.fn() }),
}));

beforeEach(() => {
  window.localStorage.clear();
  passkeyPreview.mockClear();
  if (!window.PublicKeyCredential) window.PublicKeyCredential = function () {};
  Object.defineProperty(navigator, 'credentials', {
    value: { create: vi.fn(), get: vi.fn() }, configurable: true,
  });
});

// RTL auto-cleanup relies on afterEach being global; this suite imports it
// explicitly (mirroring BiometricUnlockSettings.confirmGate.test.jsx) so each
// `it` starts from a fresh DOM — otherwise a leftover render collides on query.
afterEach(() => cleanup());

// Drive the page's OWN "Register Biometric / Passkey" button — the real user flow.
async function clickRegister() {
  const btn = await screen.findByText(/Register Biometric \/ Passkey/i);
  await act(async () => { fireEvent.click(btn); });
}

describe('BiometricAuth — wired to the REAL send-2FA passkey control (not a dead key)', () => {
  it('the master toggle drives veyrnox-2fa-passkey, the pref the send gate reads', async () => {
    render(<BiometricAuth />);
    const toggle = screen.getByLabelText('Require passkey at critical actions');

    // No passkey registered → the factor cannot be turned on (gate would brick the
    // send on a factor we cannot satisfy). The real pref stays unset.
    expect(toggle.disabled).toBe(true);
    expect(is2faPasskeyEnabled()).toBe(false);
    expect(window.localStorage.getItem(TWOFACTOR_PASSKEY_KEY)).toBeNull();

    // Register via the page's button — stores the credential AND enables the factor
    // (the user came here to turn biometric re-auth on), so the REAL pref flips on.
    await clickRegister();
    await waitFor(() => expect(isPasskeyRegistered()).toBe(true));
    await waitFor(() => expect(is2faPasskeyEnabled()).toBe(true));
    expect(window.localStorage.getItem(TWOFACTOR_PASSKEY_KEY)).toBe('1');

    // The toggle now genuinely flips the real pref off within one mount.
    await waitFor(() => expect(screen.getByLabelText('Require passkey at critical actions').disabled).toBe(false));
    fireEvent.click(screen.getByLabelText('Require passkey at critical actions'));
    expect(is2faPasskeyEnabled()).toBe(false);
    expect(window.localStorage.getItem(TWOFACTOR_PASSKEY_KEY)).toBeNull();
  });

  it('the test button runs a REAL assertion (passkeyPreview), not a no-op success', async () => {
    render(<BiometricAuth />);
    await clickRegister();

    const testBtn = await screen.findByText(/Test Biometric Now/i);
    await act(async () => { fireEvent.click(testBtn); });

    await waitFor(() => expect(passkeyPreview).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/authentication successful/i)).toBeTruthy();
  });

  it('writes nothing to the old dead biometric-auth-config key', async () => {
    render(<BiometricAuth />);
    await clickRegister();
    await waitFor(() => expect(is2faPasskeyEnabled()).toBe(true));
    expect(window.localStorage.getItem('biometric-auth-config')).toBeNull();
  });
});
