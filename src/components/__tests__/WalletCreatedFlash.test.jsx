// WalletCreatedFlash — honest copy + single-CTA contract.
//
// Post-#1900 shape: the Personal Backup push was removed. The flash now
// takes only { onDismiss } and renders a single "Go to my wallet" button.
// Old tests asserted a primary/secondary two-CTA flow with onPrimary,
// compact, and Personal-Backup copy — all deleted with that push.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let matchMediaImpl = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q) => matchMediaImpl(q),
  });
});

afterEach(() => {
  cleanup();
  matchMediaImpl = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
});

async function loadFlash() {
  const mod = await import('@/components/WalletCreatedFlash');
  return mod.default ?? mod.WalletCreatedFlash;
}

describe('WalletCreatedFlash — honest copy', () => {
  it('renders "WALLET" and "Created."', async () => {
    const Flash = await loadFlash();
    render(<Flash onDismiss={() => {}} />);
    expect(screen.getByText('WALLET')).toBeInTheDocument();
    expect(screen.getByText('Created.')).toBeInTheDocument();
  });

  it('never mentions Shamir / shards / 2-of-3 (spec, not shipped)', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onDismiss={() => {}} />);
    expect(container.textContent).not.toMatch(/shamir|shard|2-of-3|three shards/i);
  });

  it('says "Your seed never leaves it" (NOT "Nothing left your phone")', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onDismiss={() => {}} />);
    expect(container.textContent).toMatch(/Your seed never leaves it/);
    expect(container.textContent).not.toMatch(/Nothing left your phone/i);
  });

  it('does not push Personal Backup any more (#1900)', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onDismiss={() => {}} />);
    expect(container.textContent).not.toMatch(/Set up Personal Backup/i);
    expect(container.textContent).not.toMatch(/either one decrypts/i);
    expect(container.textContent).not.toMatch(/Store at least one safely/i);
  });
});

describe('WalletCreatedFlash — single CTA', () => {
  it('renders exactly one "Go to my wallet" button', async () => {
    const Flash = await loadFlash();
    render(<Flash onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /^Go to my wallet$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set up Personal Backup/i })).toBeNull();
  });

  it('clicking the CTA fires onDismiss', async () => {
    const Flash = await loadFlash();
    const onDismiss = vi.fn();
    render(<Flash onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /^Go to my wallet$/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('WalletCreatedFlash — reduced motion', () => {
  it('prefers-reduced-motion: no animation element rendered', async () => {
    matchMediaImpl = (q) => ({
      matches: /prefers-reduced-motion/.test(q),
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    });
    const Flash = await loadFlash();
    const { container } = render(<Flash onDismiss={() => {}} />);
    expect(container.querySelectorAll('animate, animateTransform').length).toBe(0);
    const html = container.innerHTML;
    expect(html).not.toMatch(/stroke-dashoffset:\s*[^0]/i);
  });
});
