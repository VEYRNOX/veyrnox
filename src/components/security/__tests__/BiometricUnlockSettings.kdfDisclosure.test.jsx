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

  it('disclosure mentions that the vault password is stored in Keychain', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/vault password/);
    expect(el.textContent.toLowerCase()).toMatch(/keychain|secure store/);
  });

  it('disclosure mentions that Argon2id / offline brute-force protection is reduced', () => {
    render(<BiometricUnlockSettings />);
    const els = screen.getAllByTestId('kdf-bypass-disclosure');
    const el = els[0];
    expect(el.textContent.toLowerCase()).toMatch(/argon2id|offline/);
  });
});
