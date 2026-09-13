// ReferralHandoff (#2541): the entry-screen bridge that carries a referral code
// from the web landing into a store install, and takes a code on native first run.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let native = false;
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native } }));

let pending = null;
let redeemed = false;
vi.mock('@/lib/referral', () => ({
  getPendingReferral: () => pending,
  hasRedeemed: () => redeemed,
}));

let deniable = false;
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => deniable }));

const copyPlain = vi.fn();
vi.mock('@/lib/copySecret', () => ({ copyPlain: (...a) => copyPlain(...a) }));

// The real capture path, with storage stubbed through the mocks above.
const captureReferralFromUrl = vi.fn((url) => {
  if (deniable) return;
  const code = url.searchParams.get('ref').trim().toUpperCase();
  if (/^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) pending = code;
});
vi.mock('@/lib/referralAttribution', () => ({
  captureReferralFromUrl: (...a) => captureReferralFromUrl(...a),
  playStoreReferralUrl: (c) => `https://play.google.com/store/apps/details?id=com.veyrnox.app&referrer=${encodeURIComponent(`ref=${c}`)}`,
}));

const ReferralHandoff = (await import('../ReferralHandoff')).default;

describe('ReferralHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native = false;
    pending = null;
    redeemed = false;
    deniable = false;
  });

  describe('web', () => {
    it('renders nothing without a pending code', () => {
      const { container } = render(<ReferralHandoff />);
      expect(container).toBeEmptyDOMElement();
    });

    it('offers both stores with the pending code, and copies it on tap', () => {
      pending = 'VYX-AB3DEF';
      render(<ReferralHandoff />);
      const play = screen.getByRole('link', { name: /google play/i });
      expect(new URL(play.href).searchParams.get('referrer')).toBe('ref=VYX-AB3DEF');
      const apple = screen.getByRole('link', { name: /app store/i });
      expect(apple.getAttribute('href')).toBe('https://apps.apple.com/app/id6790188660');
      fireEvent.click(apple);
      expect(copyPlain).toHaveBeenCalledWith('VYX-AB3DEF');
    });
  });

  describe('native', () => {
    beforeEach(() => { native = true; });

    it('applies a typed code and confirms it', () => {
      render(<ReferralHandoff />);
      fireEvent.change(screen.getByLabelText('Referral code'), { target: { value: 'vyx-ab3def' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(captureReferralFromUrl.mock.calls[0][1]).toBe('first_run_entry');
      expect(screen.getByTestId('referral-handoff-pending')).toHaveTextContent('VYX-AB3DEF');
    });

    it('rejects a malformed code with a visible error', () => {
      render(<ReferralHandoff />);
      fireEvent.change(screen.getByLabelText('Referral code'), { target: { value: 'hello' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/isn't a Veyrnox referral code/);
    });

    it('reads the clipboard only on a Paste tap', async () => {
      const readText = vi.fn(() => Promise.resolve(' VYX-AB3DEF '));
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
      render(<ReferralHandoff />);
      expect(readText).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      await waitFor(() => expect(screen.getByTestId('referral-handoff-pending')).toHaveTextContent('VYX-AB3DEF'));
      expect(readText).toHaveBeenCalledTimes(1);
    });

    it('shows a fallback when the clipboard cannot be read', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: { readText: () => Promise.reject(new Error('denied')) }, configurable: true });
      render(<ReferralHandoff />);
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Long-press the box/));
    });
  });

  it('I3: renders nothing in a deniability/demo session, even with a pending code', () => {
    deniable = true;
    pending = 'VYX-AB3DEF';
    for (const n of [false, true]) {
      native = n;
      const { container, unmount } = render(<ReferralHandoff />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('renders nothing once a code has been redeemed', () => {
    redeemed = true;
    native = true;
    const { container } = render(<ReferralHandoff />);
    expect(container).toBeEmptyDOMElement();
  });
});
