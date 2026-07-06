// src/components/security/__tests__/HardwareKekSettings.webCredentialInput.test.jsx
//
// C-UI DEFECT (found 2026-07-06 building the web WebAuthn PRF KEK e2e suite) —
// the settings card rendered the WEB enrollment credential as a digits-only
// <PinPad length={8}>, but the web vault credential is a ≥12-char PASSWORD
// (H-A minimum, verified by decryptVault inside enrollKek). A password cannot be
// entered on a numeric 8-slot pad, so web enrollment/removal through the card
// ALWAYS failed. The keystore API is fine — the defect is the input surface.
//
// This pins the CORRECT web input surface: a real password field (not a numeric
// pad), submitting the typed password to enrollKek/unenrollKek, with copy that
// says "password" (not "PIN"). Native (PIN) is unaffected — covered elsewhere.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Force the WEB branch (isNative=false).
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, recordAudit: vi.fn() }),
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

// Do NOT mock PinPad — if the component wrongly renders it on web, its numeric
// controls (e.g. the "Re-enter PIN" clear button) would appear, which we assert absent.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const HardwareKekSettings = (await import('@/components/security/HardwareKekSettings')).default;

const WEB_PW = 'correct-horse-battery-12'; // ≥12 chars (H-A web minimum)

async function renderSettled() {
  await act(async () => { render(<HardwareKekSettings />); });
}

beforeEach(() => {
  vi.clearAllMocks();
  webKeyStoreMock.isHardwareKeystoreAvailable.mockResolvedValue(true);
  webKeyStoreMock.isHardwareEnrolled.mockResolvedValue(false);
});
afterEach(() => cleanup());

describe('web enrollment: password input surface (not a numeric PIN pad)', () => {
  it('renders a password field and NO numeric PinPad on web', async () => {
    await renderSettled();
    const input = await screen.findByLabelText(/vault password/i);
    expect(input).toHaveProperty('type', 'password');
    // PinPad-specific control must be absent — proves it is not the numeric pad.
    expect(screen.queryByLabelText(/re-enter PIN/i)).toBeNull();
  });

  it('web enrollment copy says "password", never "PIN"', async () => {
    await renderSettled();
    // The enroll instruction is the web not-enrolled helper text.
    const instruction = await screen.findByText(/enter your vault password/i);
    expect(instruction).toBeTruthy();
    expect(screen.queryByText(/enter your vault pin/i)).toBeNull();
  });

  it('submitting the typed password calls enrollKek with THAT password', async () => {
    await renderSettled();
    const input = await screen.findByLabelText(/vault password/i);
    await act(async () => { fireEvent.change(input, { target: { value: WEB_PW } }); });
    await act(async () => { fireEvent.click(screen.getByText('Enable hardware protection')); });
    expect(enrollKekFn).toHaveBeenCalledTimes(1);
    expect(enrollKekFn.mock.calls[0][0]).toBe(WEB_PW);
  });

  it('Enter in the password field submits enrollment', async () => {
    await renderSettled();
    const input = await screen.findByLabelText(/vault password/i);
    await act(async () => { fireEvent.change(input, { target: { value: WEB_PW } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(enrollKekFn).toHaveBeenCalledTimes(1);
    expect(enrollKekFn.mock.calls[0][0]).toBe(WEB_PW);
  });
});

describe('web removal: password input surface', () => {
  it('removal uses a password field and unenrollKek receives the typed password', async () => {
    webKeyStoreMock.isHardwareEnrolled.mockResolvedValue(true);
    await renderSettled();
    // Enter the remove flow.
    await act(async () => { fireEvent.click(screen.getByText('Remove hardware protection')); });
    const input = await screen.findByLabelText(/vault password/i);
    expect(input).toHaveProperty('type', 'password');
    await act(async () => { fireEvent.change(input, { target: { value: WEB_PW } }); });
    // The submit button re-uses the same label in the remove flow.
    await act(async () => { fireEvent.click(screen.getByText('Remove hardware protection')); });
    expect(unenrollKekFn).toHaveBeenCalledTimes(1);
  });
});
