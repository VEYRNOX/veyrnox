// src/components/__tests__/TelemetryConsent.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Side-effect init of i18next so useTranslation() inside TelemetryConsent
// resolves keys to real English copy. Without this the tests below match
// against key names like "telemetry_consent.cta_grant" instead of copy.
import '@/i18n';
import TelemetryConsent from '@/components/TelemetryConsent';

// setConsent now comes from the leaf module @/lib/consent (which exists so
// api/trackEvent.js can read consent without importing analytics.js).
vi.mock('@/lib/consent', () => ({
  setConsent: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  emit: vi.fn(),
  FunnelEvent: { CONSENT_GRANTED: 'consent_granted', CONSENT_DENIED: 'consent_denied' },
}));

vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(),
}));

import { setConsent } from '@/lib/consent';
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

  // REGRESSION: declining used to fire CONSENT_DENIED through trackEvent(),
  // which both wrote a row to the backend and minted a persistent device id
  // for a user who had just said no. A refusal is recorded locally only.
  it('records a decline locally and transmits NOTHING', () => {
    const onChoice = vi.fn();
    render(<TelemetryConsent onChoice={onChoice} />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(setConsent).toHaveBeenCalledWith(false);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(onChoice).toHaveBeenCalledWith(false);
  });

  it('points the user at the Settings control that actually exists', () => {
    render(<TelemetryConsent onChoice={() => {}} />);
    expect(screen.getByText(/Settings → Privacy/)).toBeTruthy();
  });
});
