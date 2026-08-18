// src/components/__tests__/SecurityPosture.integration.test.jsx
//
// Smoke test using the REAL computePostureScore (src/lib/securityPosture.js) — not
// mocked — to prove the widget's self-detected PostureState fields actually reach
// the real scoring function and produce a sane, honest render. The unit suite
// (SecurityPosture.test.jsx) mocks the score function to pin the WIDGET's contract;
// this test pins the INTEGRATION.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../../rasp/useRaspArtifact', () => ({
  useRaspArtifact: () => ({ tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false }),
}));

const isBiometricUnlockEnabledMock = vi.fn(() => true);
vi.mock('../../lib/biometric', () => ({
  isBiometricUnlockEnabled: () => isBiometricUnlockEnabledMock(),
}));

const isHardwareEnrolledMock = vi.fn(async () => true);
vi.mock('../../lib/hardwareKekStatus', () => ({
  isHardwareKekEnrolled: () => isHardwareEnrolledMock(),
}));

vi.mock('../../wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

const SecurityPosture = (await import('../SecurityPosture')).default;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('SecurityPosture — real computePostureScore integration', () => {
  it('renders a score derived from real RASP=ALLOW + biometric=on + kek=on (no crash, no fabricated 100%)', async () => {
    render(
      <MemoryRouter>
        <SecurityPosture />
      </MemoryRouter>,
    );
    // RASP ALLOW(25) + biometric(5) + kekActive-with-no-hardwareTier(5) = 35;
    // PIN/recovery/WC default off (not self-detected by this widget).
    await waitFor(() => expect(screen.getByTestId('security-posture-card').textContent).toContain('35%'));
    expect(screen.getByTestId('security-posture-card').textContent).toContain('Weak');
  });

  it('an integrator-supplied state override raises the real score', async () => {
    render(
      <MemoryRouter>
        <SecurityPosture state={{
          pinCreated: true, pinLength: 14, hardwareTier: 'STRONGBOX',
          recoveryPassphraseSet: true, shareAWrapped: true, shareBUploaded: true,
          shareCExported: true, shareCVerified: true,
          wcSpendLimitSet: true, wcSessionExpiry: true, wcStepUpReauth: true,
        }} />
      </MemoryRouter>,
    );
    // Integrator-supplied fields complete the missing home-page inputs, so the
    // real scoring function now reaches a true 100/100 ceiling.
    await waitFor(() => expect(screen.getByTestId('security-posture-card').textContent).toContain('100%'));
    expect(screen.getByTestId('security-posture-card').textContent).toContain('Complete');
  });
});
