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

  it('disclosure mentions that the wallet password is stored on the device', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/wallet password/);
    expect(el.textContent.toLowerCase()).toMatch(/device/);
  });

  it('disclosure mentions the risk of backup extraction', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/backup|protection/);
  });
});
