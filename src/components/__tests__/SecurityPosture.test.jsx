// src/components/__tests__/SecurityPosture.test.jsx
//
// Covers: render (score + graduated color), banner message, the I3 deniability
// write-gate on dismiss, dismiss hides the card, and score-drop-since-dismiss
// re-shows it regardless of the stored dismissal.
//
// computePostureScore (src/lib/securityPosture.js) is mocked entirely — this suite
// is a consumer-contract test for the WIDGET (return shape: percentage/color/label/
// bannerMessage, per securityPosture.js's computePostureScore JSDoc), not a test of
// the scoring algorithm itself (owned/tested separately in
// lib/__tests__/securityPostureScore.test.js).

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const computePostureScoreMock = vi.fn();
vi.mock('../../lib/securityPosture', () => ({
  computePostureScore: (...a) => computePostureScoreMock(...a),
}));

vi.mock('../../rasp/useRaspArtifact', () => ({
  useRaspArtifact: () => ({ tier: 'ALLOW', sentence: null, blockedActions: [], requiresBiometric: false }),
}));

const isBiometricUnlockEnabledMock = vi.fn(() => false);
vi.mock('../../lib/biometric', () => ({
  isBiometricUnlockEnabled: () => isBiometricUnlockEnabledMock(),
}));

const isHardwareEnrolledMock = vi.fn(async () => false);
vi.mock('../../lib/hardwareKekStatus', () => ({
  isHardwareKekEnrolled: () => isHardwareEnrolledMock(),
}));

let deniabilityActive = false;
vi.mock('../../wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniabilityActive,
}));

const SecurityPosture = (await import('../SecurityPosture')).default;
const { POSTURE_DISMISSED_KEY } = await import('../SecurityPosture');

function renderWidget(props) {
  return render(
    <MemoryRouter>
      <SecurityPosture {...props} />
    </MemoryRouter>,
  );
}

function setPosture({ percentage, color, label, bannerMessage = '' }) {
  computePostureScoreMock.mockReturnValue({ percentage, color, label, bannerMessage, dimensions: {}, lowestDimension: '', total: percentage });
}

beforeEach(() => {
  vi.clearAllMocks();
  isBiometricUnlockEnabledMock.mockReturnValue(false);
  isHardwareEnrolledMock.mockResolvedValue(false);
  deniabilityActive = false;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('SecurityPosture — render', () => {
  it('renders the score percentage and label with the graduated colour', () => {
    setPosture({ percentage: 42, color: '#E8A838', label: 'Weak' });
    renderWidget();
    expect(screen.getByTestId('security-posture-card')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('Weak')).toHaveStyle({ color: '#E8A838' });
  });

  it('links to /security-dashboard for details', () => {
    setPosture({ percentage: 90, color: '#4ADAC2', label: 'Complete' });
    renderWidget();
    const link = screen.getByText('Review').closest('a');
    expect(link.getAttribute('href')).toBe('/security-dashboard');
  });

  it('passes an integrator-supplied state override through to computePostureScore', () => {
    setPosture({ percentage: 70, color: '#D4C44A', label: 'Fair' });
    renderWidget({ state: { recoveryPassphraseSet: true } });
    const callArg = computePostureScoreMock.mock.calls[0][0];
    expect(callArg.recoveryPassphraseSet).toBe(true);
  });
});

describe('SecurityPosture — banner message', () => {
  it('shows the bannerMessage the score function returns', () => {
    setPosture({ percentage: 55, color: '#D4C44A', label: 'Fair', bannerMessage: 'Hardware protection available — enable for stronger binding' });
    renderWidget();
    expect(screen.getByTestId('posture-banner').textContent).toBe('Hardware protection available — enable for stronger binding');
  });

  it('renders no banner when bannerMessage is empty', () => {
    setPosture({ percentage: 100, color: '#4ADAC2', label: 'Complete', bannerMessage: '' });
    renderWidget();
    expect(screen.queryByTestId('posture-banner')).toBeNull();
  });
});

describe('SecurityPosture — deniability write-gate (I3)', () => {
  it('does not write localStorage on dismiss during a decoy/demo session', () => {
    deniabilityActive = true;
    setPosture({ percentage: 60, color: '#D4C44A', label: 'Fair' });
    renderWidget();
    fireEvent.click(screen.getByTestId('posture-dismiss'));
    expect(localStorage.getItem(POSTURE_DISMISSED_KEY)).toBeNull();
  });

  it('writes localStorage on dismiss during a primary session', () => {
    deniabilityActive = false;
    setPosture({ percentage: 60, color: '#D4C44A', label: 'Fair' });
    renderWidget();
    fireEvent.click(screen.getByTestId('posture-dismiss'));
    const stored = JSON.parse(localStorage.getItem(POSTURE_DISMISSED_KEY));
    expect(stored.score).toBe(60);
    expect(typeof stored.at).toBe('number');
  });
});

describe('SecurityPosture — dismiss behaviour', () => {
  it('hides the card immediately after Dismiss is clicked', () => {
    setPosture({ percentage: 70, color: '#D4C44A', label: 'Fair' });
    renderWidget();
    expect(screen.getByTestId('security-posture-card')).toBeTruthy();
    fireEvent.click(screen.getByTestId('posture-dismiss'));
    expect(screen.queryByTestId('security-posture-card')).toBeNull();
  });

  it('stays hidden on a fresh mount when the score has not dropped since dismiss', () => {
    localStorage.setItem(POSTURE_DISMISSED_KEY, JSON.stringify({ at: Date.now(), score: 70 }));
    setPosture({ percentage: 75, color: '#B8D44A', label: 'Strong' });
    renderWidget();
    expect(screen.queryByTestId('security-posture-card')).toBeNull();
  });

  it('re-shows on a fresh mount when the score has dropped since dismiss', () => {
    localStorage.setItem(POSTURE_DISMISSED_KEY, JSON.stringify({ at: Date.now(), score: 70 }));
    setPosture({ percentage: 40, color: '#E8A838', label: 'Weak' });
    renderWidget();
    expect(screen.getByTestId('security-posture-card')).toBeTruthy();
  });
});
