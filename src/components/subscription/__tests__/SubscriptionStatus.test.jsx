import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubscriptionStatus, { statusContent, formatExpiry } from '../SubscriptionStatus';
import { SUBSCRIPTION_STATUS as S } from '@/lib/subscriptionState';

const MS = Date.parse('2027-03-01T12:00:00Z');

describe('SubscriptionStatus', () => {
  it('renders nothing when there is no subscription history', () => {
    const { container } = render(<SubscriptionStatus subscription={{ status: S.NONE }} />);
    expect(container.firstChild).toBeNull();
    expect(render(<SubscriptionStatus />).container.firstChild).toBeNull();
  });

  it('cancelled shows the end date and the cancelled-until-date copy', () => {
    render(<SubscriptionStatus subscription={{ status: S.CANCELLED, expiresAt: MS }} />);
    expect(screen.getByTestId('subscription-expiry').textContent).toMatch(/^Ends on /);
    expect(screen.getByRole('status').textContent).toMatch(/cancelled and remains active until/);
  });

  it('cancelled without a readable date does not invent one', () => {
    const c = statusContent({ status: S.CANCELLED, expiresAt: null });
    expect(c.dateLabel).toBeNull();
    expect(c.message).toMatch(/until the end of the current billing period/);
  });

  it('every state keeps wallet and assets accessible', () => {
    for (const status of [S.ACTIVE, S.CANCELLED, S.BILLING_RETRY, S.EXPIRED]) {
      const { message } = statusContent({ status, expiresAt: MS });
      expect(message).toMatch(/wallet/i);
    }
    expect(statusContent({ status: S.BILLING_RETRY }).message).toMatch(/remain\s+accessible/);
    expect(statusContent({ status: S.EXPIRED }).message).toMatch(/reverted to the Free tier/);
  });

  it('compact mode shows only the date line', () => {
    render(<SubscriptionStatus compact subscription={{ status: S.EXPIRED, expiresAt: MS }} />);
    expect(screen.getByTestId('subscription-expiry').textContent).toMatch(/^Ended on /);
    expect(screen.getByRole('status').textContent).not.toMatch(/Free tier/);
  });

  it('formatExpiry is safe on garbage', () => {
    expect(formatExpiry(null)).toBeNull();
    expect(formatExpiry(NaN)).toBeNull();
  });
});
