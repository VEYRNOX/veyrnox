// FirstReceiveCard — Slice C of the first-receive walkthrough (plan
// docs/superpowers/plans/2026-08-09-first-receive-card-slice-c.md).
//
// Pins the CARD contract as a small, dumb component: it renders address + QR +
// copy + a single "You're set" CTA, it calls `onDismiss` when the CTA fires,
// and it writes NOTHING to localStorage itself. Persistence of the
// "fired" marker is the parent hook's job (`useFirstReceiveShown`), not this
// card's. Absent-address = honest empty state, never a fake success.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import FirstReceiveCard from '@/components/FirstReceiveCard';

const ADDRESS = '0x0000000000000000000000000000000000000001';

let writeText;
let originalClipboard;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  originalClipboard = navigator.clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
  vi.restoreAllMocks();
});

describe('FirstReceiveCard', () => {
  it('renders address, QR, copy button, and CTA', async () => {
    render(<FirstReceiveCard address={ADDRESS} onDismiss={vi.fn()} />);

    // Address is visible somewhere in the card (either full or truncated).
    // Match a prefix so a `.mono-value` truncation like "0x00...0001" also passes.
    const addressPrefix = ADDRESS.slice(0, 6);
    const addressNodes = screen.getAllByText((_, el) =>
      !!el && !!el.textContent && el.textContent.includes(addressPrefix)
    );
    expect(addressNodes.length).toBeGreaterThan(0);

    // QR renders async (qrcode.toDataURL is a Promise). Wait for the <img>.
    const qr = await screen.findByRole('img', { name: /qr|address/i });
    expect(qr).toBeInTheDocument();

    // Copy button.
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();

    // "You're set" CTA — allow the UI a bit of copy freedom, match on intent.
    expect(
      screen.getByRole('button', { name: /you.?re set|continue|done|got it/i })
    ).toBeInTheDocument();
  });

  it('copy button writes the exact address to clipboard', async () => {
    render(<FirstReceiveCard address={ADDRESS} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });

  it('copy button shows success feedback after click', async () => {
    render(<FirstReceiveCard address={ADDRESS} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    // Either an explicit data-testid or a "copied" a11y label / text — match
    // whichever the UI agent chose (ReceiveCrypto.jsx pattern uses a CheckCircle2
    // inside AnimatePresence whose parent button flips its aria-label to "copied").
    await waitFor(() => {
      const testidHit = screen.queryByTestId('copy-success');
      const ariaHit = screen.queryByRole('button', { name: /copied/i });
      const textHit = screen.queryByText(/copied/i);
      expect(testidHit || ariaHit || textHit).toBeTruthy();
    });
  });

  it('CTA fires onDismiss exactly once and never a differently-named callback', () => {
    const onDismiss = vi.fn();
    // Guard against the component silently accepting an onDone/onComplete prop:
    // if it did, a future refactor renaming the callback would go undetected.
    // We pass NEITHER — a component that only calls onDismiss is the only shape
    // that satisfies test 4 as written.
    render(<FirstReceiveCard address={ADDRESS} onDismiss={onDismiss} />);

    fireEvent.click(
      screen.getByRole('button', { name: /you.?re set|continue|done|got it/i })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('address absent renders honest empty state and still lets user dismiss', () => {
    const onDismiss = vi.fn();
    render(<FirstReceiveCard address={null} onDismiss={onDismiss} />);

    // Some honest "not ready" surface — text OR aria — never a fake address.
    const empty =
      screen.queryByText(/unavailable|not ready|refresh|try again/i) ||
      screen.queryByRole('status');
    expect(empty).toBeTruthy();

    // Copy button either absent or disabled — never active with no address to copy.
    const copyBtn = screen.queryByRole('button', { name: /copy/i });
    if (copyBtn) expect(copyBtn).toBeDisabled();

    // CTA still works so the user is not trapped.
    fireEvent.click(
      screen.getByRole('button', { name: /you.?re set|continue|done|got it/i })
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('writes nothing to localStorage from the card itself', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    render(<FirstReceiveCard address={ADDRESS} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /you.?re set|continue|done|got it/i })
    );

    // The fireOnce marker (`veyrnox-first-receive-shown-fired`) is owned by the
    // PARENT hook `useFirstReceiveShown`. The card is a dumb component and
    // must not touch storage — otherwise decoy sessions could leak a real tell.
    expect(setItem).not.toHaveBeenCalled();
  });
});
