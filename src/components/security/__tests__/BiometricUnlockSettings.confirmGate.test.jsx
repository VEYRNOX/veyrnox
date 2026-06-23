// NF-2 confirm-gate tests.
//
// Asserts the two-step enable flow:
//  1. Flipping the toggle ON does NOT immediately call setBiometricUnlockEnabled
//     or recordAudit — it only enters pending state.
//  2. The confirm panel appears with the expected copy and two action buttons.
//  3. Clicking "Enable one-tap unlock" calls setBiometricUnlockEnabled(true) and
//     recordAudit('settings_changed'), then hides the confirm panel.
//  4. Clicking "Cancel" calls neither, leaves enabled=false, hides the panel.
//  5. Flipping the toggle OFF stays immediate — calls disableBiometricUnlock +
//     recordAudit right away, no confirm panel.
//
// NOTE: @testing-library/jest-dom is not wired in this project; we use core
// matchers (toBeTruthy, toBeNull, toBeCalledTimes, etc.).
// NOTE: the Radix UI Switch renders a <button role="switch">; clicking it
// triggers onCheckedChange via Radix internals. We use fireEvent.click on the
// button element to simulate the user flip.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import BiometricUnlockSettings from '@/components/security/BiometricUnlockSettings';

// --- shared mocks -----------------------------------------------------------

const mockSetBiometricUnlockEnabled = vi.fn();
const mockDisableBiometricUnlock = vi.fn();
const mockRecordAudit = vi.fn();

// Default: biometrics NOT enabled at mount, demo-mode status.
vi.mock('@/lib/biometric', () => ({
  isBiometricUnlockEnabled: () => false,
  setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
  getBiometricStatus: () =>
    Promise.resolve({
      available: false,
      detail: 'Not available on this platform.',
      mode: 'demo',
      simulated: false,
    }),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    biometricPreview: vi.fn(),
    disableBiometricUnlock: (...args) => mockDisableBiometricUnlock(...args),
    recordAudit: (...args) => mockRecordAudit(...args),
  }),
}));

// Helper: render and wait for the async status probe to settle so the
// component is in its stable state before interactions.
async function renderSettled() {
  let container;
  await act(async () => {
    ({ container } = render(<BiometricUnlockSettings />));
  });
  return container;
}

// Helper: find the Switch button element (Radix renders role="switch").
function getToggle() {
  return screen.getByRole('switch', { name: /require biometric unlock/i });
}

// ---------------------------------------------------------------------------

describe('BiometricUnlockSettings — NF-2 enable confirm gate', () => {
  beforeEach(() => {
    mockSetBiometricUnlockEnabled.mockClear();
    mockDisableBiometricUnlock.mockClear();
    mockRecordAudit.mockClear();
  });

  // Explicit cleanup: RTL auto-cleanup relies on afterEach being a global,
  // but vitest.config.js does not set globals:true here. Be explicit.
  afterEach(() => {
    cleanup();
  });

  it('flipping ON does NOT immediately call setBiometricUnlockEnabled', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    expect(mockSetBiometricUnlockEnabled).not.toHaveBeenCalled();
  });

  it('flipping ON does NOT immediately call recordAudit', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('flipping ON shows the confirm panel', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    const panel = screen.getByTestId('biometric-enable-confirm');
    expect(panel).toBeTruthy();
  });

  it('confirm panel warns about physical device access risk', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    const panel = screen.getByTestId('biometric-enable-confirm');
    const text = panel.textContent.toLowerCase();
    expect(text).toMatch(/physical access|device/);
    expect(text).toMatch(/pin|unlock/);
  });

  it('confirm panel has "Enable one-tap unlock" and "Cancel" buttons', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    expect(screen.getByTestId('biometric-confirm-enable-btn')).toBeTruthy();
    expect(screen.getByTestId('biometric-cancel-enable-btn')).toBeTruthy();
  });

  it('toggle stays visually OFF (unchecked) while pending', async () => {
    await renderSettled();

    fireEvent.click(getToggle());

    // The Switch is unchecked (enabled=false, pendingEnable=true but checked
    // uses `enabled` not `pendingEnable`) — Radix sets data-state="unchecked".
    const toggle = getToggle();
    expect(toggle.getAttribute('data-state')).toBe('unchecked');
  });

  it('clicking "Enable one-tap unlock" calls setBiometricUnlockEnabled(true)', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-confirm-enable-btn'));

    expect(mockSetBiometricUnlockEnabled).toHaveBeenCalledWith(true);
    expect(mockSetBiometricUnlockEnabled).toHaveBeenCalledTimes(1);
  });

  it('clicking "Enable one-tap unlock" calls recordAudit("settings_changed")', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-confirm-enable-btn'));

    expect(mockRecordAudit).toHaveBeenCalledWith('settings_changed');
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
  });

  it('confirm panel is removed after "Enable one-tap unlock" is clicked', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-confirm-enable-btn'));

    expect(screen.queryByTestId('biometric-enable-confirm')).toBeNull();
  });

  it('clicking "Cancel" calls neither setBiometricUnlockEnabled nor disableBiometricUnlock', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-cancel-enable-btn'));

    expect(mockSetBiometricUnlockEnabled).not.toHaveBeenCalled();
    expect(mockDisableBiometricUnlock).not.toHaveBeenCalled();
  });

  it('clicking "Cancel" does not call recordAudit', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-cancel-enable-btn'));

    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('confirm panel is removed after "Cancel" is clicked', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-cancel-enable-btn'));

    expect(screen.queryByTestId('biometric-enable-confirm')).toBeNull();
  });

  it('toggle is still OFF after "Cancel"', async () => {
    await renderSettled();

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-cancel-enable-btn'));

    expect(getToggle().getAttribute('data-state')).toBe('unchecked');
  });

  it('DISABLE path: flipping OFF calls disableBiometricUnlock immediately, no confirm', async () => {
    // Re-render with biometric already enabled so we can flip it OFF.
    // We need to get to enabled=true state; use confirmEnable path.
    await renderSettled();
    fireEvent.click(getToggle()); // flip ON → pending
    fireEvent.click(screen.getByTestId('biometric-confirm-enable-btn')); // confirm → enabled

    mockDisableBiometricUnlock.mockClear();
    mockRecordAudit.mockClear();

    fireEvent.click(getToggle()); // flip OFF

    // No confirm panel should appear.
    expect(screen.queryByTestId('biometric-enable-confirm')).toBeNull();
    // disableBiometricUnlock must be called immediately.
    expect(mockDisableBiometricUnlock).toHaveBeenCalledTimes(1);
    // recordAudit must be called immediately for the OFF action.
    expect(mockRecordAudit).toHaveBeenCalledWith('settings_changed');
  });
});
