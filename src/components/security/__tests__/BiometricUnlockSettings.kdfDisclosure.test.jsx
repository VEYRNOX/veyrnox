import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BiometricUnlockSettings from '@/components/security/BiometricUnlockSettings';

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

  it('disclosure mentions that the wallet password is stored in device secure storage', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/wallet password/);
    expect(el.textContent.toLowerCase()).toMatch(/secure storage|device/);
  });

  it('disclosure warns about physical device access reducing offline protection', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/physical access|offline/);
  });
});
