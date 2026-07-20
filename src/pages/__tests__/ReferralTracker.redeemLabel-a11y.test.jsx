// Behavioural regression test — the referral-code redeem <Input> gets a real
// accessible name and the validation error is linked/announced
// (2026-07-20 branch review). Previously: placeholder-only "label" (fails
// WCAG 3.3.2, vanishes once typed over), no aria-describedby/aria-invalid,
// and the error text was not in a live region.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const redeemCodeMock = vi.fn();
vi.mock('@/api/referralApi', () => ({
  registerCode: vi.fn(async () => {}),
  redeemCode: (...a) => redeemCodeMock(...a),
  fetchStatus: vi.fn(async () => null),
  fetchPaidCount: vi.fn(async () => null),
  fetchEarnings: vi.fn(async () => null),
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
  isDeniabilitySessionActive: () => false,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

async function renderPage() {
  const { default: ReferralTracker } = await import('../ReferralTracker.jsx');
  return render(<ReferralTracker />);
}

describe('ReferralTracker — redeem code input has a real accessible name', () => {
  it('the input has an accessible name via role+name query, not just a placeholder', async () => {
    await renderPage();
    const input = await screen.findByRole('textbox', { name: /referral code/i });
    expect(input).toBeTruthy();
    // Name survives typing over the placeholder (the actual WCAG 3.3.2 bug).
    fireEvent.change(input, { target: { value: 'VYX-000000' } });
    expect(screen.getByRole('textbox', { name: /referral code/i })).toBe(input);
  });

  it('starts with no aria-invalid / aria-describedby (no error yet)', async () => {
    await renderPage();
    const input = await screen.findByRole('textbox', { name: /referral code/i });
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('a failed redemption marks aria-invalid, links the error via aria-describedby, and the error is a live alert', async () => {
    redeemCodeMock.mockRejectedValue({ status: 404 });
    await renderPage();

    const input = await screen.findByRole('textbox', { name: /referral code/i });
    fireEvent.change(input, { target: { value: 'VYX-NOTFND' } });
    fireEvent.click(screen.getByRole('button', { name: /apply referral code/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/code not found/i);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('typing again after an error clears aria-invalid/aria-describedby along with the message', async () => {
    redeemCodeMock.mockRejectedValue({ status: 404 });
    await renderPage();

    const input = await screen.findByRole('textbox', { name: /referral code/i });
    fireEvent.change(input, { target: { value: 'VYX-NOTFND' } });
    fireEvent.click(screen.getByRole('button', { name: /apply referral code/i }));
    await screen.findByRole('alert');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: 'VYX-RETRY01' } });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
