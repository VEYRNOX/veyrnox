import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import BiometricAuth from '@/pages/BiometricAuth';
import { is2faBiometricEnabled, TWOFACTOR_BIOMETRIC_KEY } from '@/lib/biometric';

// Native app + demo: getBiometricStatus() resolves to a simulated, AVAILABLE
// biometric (no real hardware needed in jsdom) and verifyBiometric2fa() resolves
// true. This exercises the NATIVE branch of the page (OS biometric, no passkey).
vi.mock('@/api/demoClient', () => ({ DEMO: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ recordAudit: vi.fn(), passkeyPreview: vi.fn() }),
}));

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => cleanup());

describe('BiometricAuth (native) — drives the REAL veyrnox-2fa-biometric send-gate pref', () => {
  it('the master toggle turns the OS-biometric second factor on and off', async () => {
    render(<BiometricAuth />);
    const toggle = await screen.findByLabelText('Require biometrics at critical actions');

    // Starts off; the real pref is unset.
    expect(is2faBiometricEnabled()).toBe(false);
    expect(window.localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY)).toBeNull();

    // Once availability resolves (demo → available), the toggle is enabled and
    // flipping it writes the REAL pref the send gate + action guard read.
    await waitFor(() => expect(/** @type {HTMLButtonElement} */ (toggle).disabled).toBe(false));
    await act(async () => { fireEvent.click(toggle); });
    expect(is2faBiometricEnabled()).toBe(true);
    expect(window.localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY)).toBe('1');

    // And back off.
    await act(async () => { fireEvent.click(screen.getByLabelText('Require biometrics at critical actions')); });
    expect(is2faBiometricEnabled()).toBe(false);
    expect(window.localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY)).toBeNull();
  });

  it('there is NO passkey "Register" button on native (OS biometric needs no registration)', async () => {
    render(<BiometricAuth />);
    await screen.findByLabelText('Require biometrics at critical actions');
    expect(screen.queryByText(/Register Biometric \/ Passkey/i)).toBeNull();
  });

  it('Test Authentication runs the OS biometric (simulated in demo) and reports success', async () => {
    render(<BiometricAuth />);
    const testBtn = await screen.findByText(/Test Biometric Now/i);
    await waitFor(() => expect(/** @type {HTMLButtonElement} */ (testBtn.closest('button')).disabled).toBe(false));
    await act(async () => { fireEvent.click(testBtn); });
    expect(await screen.findByText(/authentication successful/i)).toBeTruthy();
  });
});
