// TheftProtectionSettings — a device the gate would refuse at every unlock must not
// be able to opt in (#2515). The setting can only be turned off from inside the
// unlocked wallet, so enabling it on an unsupported device was a permanent lockout.
//
// Contract:
//   - Enable runs getTheftProtectionSupport first; unsupported → nothing persisted,
//     switch stays off, a reason is shown.
//   - Supported (iOS Face ID available, Android biometric available) → persisted.
//   - Disable is never gated and never probes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { platformMock, probeMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'ios'),
  probeMock: vi.fn(async () => null),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platformMock() !== 'web', getPlatform: () => platformMock() },
}));
vi.mock('@/lib/biometricProbe', () => ({ getCachedBiometry: (...a) => probeMock(...a) }));
vi.mock('@/lib/biometric', () => ({ verifyBiometric2fa: vi.fn() }));
vi.mock('@/rasp', () => ({
  getFreshRaspArtifact: vi.fn(),
  TIER: Object.freeze({ ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' }),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: vi.fn(() => false) }));

import { THEFT_PROTECTION_KEY } from '@/lib/theftProtection';
import TheftProtectionSettings from '@/components/security/TheftProtectionSettings';

const toggle = () => screen.getByTestId('theft-protection-toggle');

beforeEach(() => {
  localStorage.clear();
  platformMock.mockReset().mockReturnValue('ios');
  probeMock.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); });

async function expectRefused() {
  await waitFor(() => expect(screen.getByTestId('theft-protection-unsupported')).toBeTruthy());
  expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
  expect(toggle().getAttribute('aria-checked')).toBe('false');
}

describe('TheftProtectionSettings — enable is capability-gated (#2515)', () => {
  it('web: refuses without probing', async () => {
    platformMock.mockReturnValue('web');
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('Touch ID iPhone: refuses', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 1 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('Face ID hardware but not set up: refuses', async () => {
    probeMock.mockResolvedValue({ isAvailable: false, biometryType: 2 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('probe failure: refuses (fail closed on enable)', async () => {
    probeMock.mockRejectedValue(new Error('bridge down'));
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('iPhone with Face ID available: enables', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 2 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('theft-protection-unsupported')).toBeNull();
  });

  it('Android with a biometric available: enables', async () => {
    platformMock.mockReturnValue('android');
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 3 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
  });

  it('disable is never gated, even on an unsupported device', async () => {
    localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    platformMock.mockReturnValue('web');
    render(<TheftProtectionSettings />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull());
    expect(probeMock).not.toHaveBeenCalled();
  });
});
