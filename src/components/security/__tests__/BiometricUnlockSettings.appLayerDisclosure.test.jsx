// BIO-03 (2026-07-05 internal audit, MEDIUM): the app-layer-only biometric gate
// limitation was previously documented only in a JSX comment (never rendered to
// users). This test pins the VISIBLE disclosure so a future refactor cannot
// silently drop it back into a comment.
//
// Requirement: when biometrics are available AND the user has enabled (or is in
// the pending-enable confirm step for) biometric unlock, the settings screen
// must render a plain-language disclosure that:
//   - names the app-level (not OS-enforced hardware ACL) nature of the gate,
//   - points the user at Hardware KEK (Phase 2) as the hardware-bound option.
// It must NOT render when biometrics are unavailable, and (per the component's
// own gating) is tied to available && (enabled || pendingEnable).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const mockSetBiometricUnlockEnabled = vi.fn();
const mockDisableBiometricUnlock = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    biometricPreview: vi.fn(),
    disableBiometricUnlock: (...args) => mockDisableBiometricUnlock(...args),
    recordAudit: (...args) => mockRecordAudit(...args),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

function getToggle() {
  return screen.getByRole('switch', { name: /biometric unlock \(primary wallet\)/i });
}

describe('BiometricUnlockSettings — BIO-03 app-layer gate disclosure (visible, not just JSDoc)', () => {
  it('is NOT rendered when biometrics are unavailable on the device', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: false, detail: 'Not available on this platform.', mode: 'demo', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });
    expect(screen.queryByTestId('biometric-app-layer-disclosure')).toBeNull();
  });

  it('renders once the user is in the pending-enable (confirm) step, before persisting', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: true, detail: 'Face ID available.', mode: 'native', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });

    fireEvent.click(getToggle());

    const disclosure = screen.getByTestId('biometric-app-layer-disclosure');
    expect(disclosure).toBeTruthy();
  });

  it('renders once biometric unlock is enabled (post-confirm)', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: true, detail: 'Face ID available.', mode: 'native', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });

    fireEvent.click(getToggle());
    fireEvent.click(screen.getByTestId('biometric-confirm-enable-btn'));

    const disclosure = screen.getByTestId('biometric-app-layer-disclosure');
    expect(disclosure).toBeTruthy();
  });

  it('discloses the app-level (not OS-enforced hardware ACL) limitation in plain language', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: true, detail: 'Face ID available.', mode: 'native', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });

    fireEvent.click(getToggle());

    const text = screen.getByTestId('biometric-app-layer-disclosure').textContent.toLowerCase();
    expect(text).toMatch(/inside the app|app level|app-level/);
    expect(text).toMatch(/not.*operating system|not.*os.*hardware|hardware.*acl/);
  });

  it('points the user at Hardware KEK as the hardware-bound alternative', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: true, detail: 'Face ID available.', mode: 'native', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });

    fireEvent.click(getToggle());

    const text = screen.getByTestId('biometric-app-layer-disclosure').textContent;
    expect(text).toMatch(/Hardware Protection/);
  });

  it('uses muted-foreground text (calm disclosure), not the caution/alert palette', async () => {
    vi.doMock('@/lib/biometric', () => ({
      isBiometricUnlockEnabled: () => false,
      setBiometricUnlockEnabled: (...args) => mockSetBiometricUnlockEnabled(...args),
      getBiometricStatus: () =>
        Promise.resolve({ available: true, detail: 'Face ID available.', mode: 'native', simulated: false }),
    }));
    const { default: Settings } = await import('@/components/security/BiometricUnlockSettings');
    await act(async () => {
      render(<Settings />);
    });

    fireEvent.click(getToggle());

    const disclosure = screen.getByTestId('biometric-app-layer-disclosure');
    expect(disclosure.className).toMatch(/text-muted-foreground/);
    expect(disclosure.className).not.toMatch(/text-caution|bg-caution/);
  });
});
