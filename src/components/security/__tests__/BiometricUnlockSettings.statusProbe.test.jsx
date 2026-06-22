import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BiometricUnlockSettings from '@/components/security/BiometricUnlockSettings';

// The availability probe REJECTS (e.g. the native bridge throws). The component
// must fail honest — render an unavailable state — not hang forever on the
// "Checking availability…" spinner (the previous silent .catch(() => {}) bug).
// NOTE: this project does not wire @testing-library/jest-dom, so we assert with
// core matchers (toBeTruthy / toBeNull) — matching the sibling kdfDisclosure test.
vi.mock('@/lib/biometric', () => ({
  isBiometricUnlockEnabled: () => false,
  setBiometricUnlockEnabled: vi.fn(),
  getBiometricStatus: () => Promise.reject(new Error('probe unavailable')),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    biometricPreview: vi.fn(),
    disableBiometricUnlock: vi.fn(),
    recordAudit: vi.fn(),
  }),
}));

describe('BiometricUnlockSettings — a failed status probe is surfaced, not swallowed', () => {
  it('renders an unavailable state instead of hanging on "Checking availability…"', async () => {
    render(<BiometricUnlockSettings />);

    // findByText throws if the element never appears — awaiting it IS the assertion
    // that the rejected probe resolved into the honest unavailable copy.
    const detail = await screen.findByText(/could not check biometric availability/i);
    expect(detail).toBeTruthy();

    // …and the loading spinner copy is gone (no permanent "Checking availability…").
    expect(screen.queryByText(/checking availability/i)).toBeNull();
  });
});
