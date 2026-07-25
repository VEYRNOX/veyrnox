// src/components/__tests__/TelemetryConsent.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TelemetryConsent from '@/components/TelemetryConsent';

vi.mock('@/lib/analytics', () => ({
  setConsent: vi.fn(),
  emit: vi.fn(),
  FunnelEvent: { CONSENT_GRANTED: 'consent_granted', CONSENT_DENIED: 'consent_denied' },
}));

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(),
}));

import { setConsent } from '@/lib/analytics';
import { trackEvent } from '@/api/trackEvent';

describe('TelemetryConsent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders opt-in and opt-out buttons', () => {
    render(<TelemetryConsent onChoice={() => {}} />);
    expect(screen.getByRole('button', { name: /help improve/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /no thanks/i })).toBeTruthy();
  });

  it('calls setConsent(true), trackEvent(CONSENT_GRANTED), and onChoice(true) on accept', () => {
    const onChoice = vi.fn();
    render(<TelemetryConsent onChoice={onChoice} />);
    fireEvent.click(screen.getByRole('button', { name: /help improve/i }));
    expect(setConsent).toHaveBeenCalledWith(true);
    expect(trackEvent).toHaveBeenCalledWith('consent_granted', expect.anything());
    expect(onChoice).toHaveBeenCalledWith(true);
  });

  it('calls setConsent(false), trackEvent(CONSENT_DENIED), and onChoice(false) on decline', () => {
    const onChoice = vi.fn();
    render(<TelemetryConsent onChoice={onChoice} />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(setConsent).toHaveBeenCalledWith(false);
    expect(trackEvent).toHaveBeenCalledWith('consent_denied', expect.anything());
    expect(onChoice).toHaveBeenCalledWith(false);
  });
});
