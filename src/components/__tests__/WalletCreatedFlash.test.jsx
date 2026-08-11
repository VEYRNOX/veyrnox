// WalletCreatedFlash — Slice G+H plan §2. Pins honest copy, CTAs, and the
// compact/reduced-motion contracts.
//
// RED phase: component does not yet exist.

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
    render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('WALLET')).toBeInTheDocument();
    expect(screen.getByText('Created.')).toBeInTheDocument();
  });

  it('never mentions Shamir / shards / 2-of-3 (spec, not shipped)', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    expect(container.textContent).not.toMatch(/shamir|shard|2-of-3|three shards/i);
  });

  it('says "Your seed never leaves it" (NOT "Nothing left your phone")', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    expect(container.textContent).toMatch(/Your seed never leaves it/);
    expect(container.textContent).not.toMatch(/Nothing left your phone/i);
  });

  it('states "either one decrypts" AND "Store at least one safely"', async () => {
    const Flash = await loadFlash();
    const { container } = render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    expect(container.textContent).toMatch(/either one decrypts/i);
    expect(container.textContent).toMatch(/Store at least one safely/i);
  });
});

describe('WalletCreatedFlash — CTAs', () => {
  it('renders exact primary + secondary CTA copy', async () => {
    const Flash = await loadFlash();
    render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /^Set up Personal Backup$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip for now — take me to my wallet/ })).toBeInTheDocument();
  });

  it('primary click fires onPrimary', async () => {
    const Flash = await loadFlash();
    const onPrimary = vi.fn();
    render(<Flash onPrimary={onPrimary} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Set up Personal Backup$/ }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('secondary click fires onDismiss', async () => {
    const Flash = await loadFlash();
    const onDismiss = vi.fn();
    render(<Flash onPrimary={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip for now — take me to my wallet/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('WalletCreatedFlash — compact + reduced-motion', () => {
  it('compact prop toggles a distinguishing class/attribute on the root', async () => {
    const Flash = await loadFlash();
    const { container: full } = render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    const fullHtml = full.firstChild?.outerHTML ?? '';
    cleanup();
    const { container: compact } = render(<Flash compact onPrimary={() => {}} onDismiss={() => {}} />);
    const compactHtml = compact.firstChild?.outerHTML ?? '';
    expect(compactHtml).not.toEqual(fullHtml);
  });

  it('prefers-reduced-motion: no animation element rendered', async () => {
    matchMediaImpl = (q) => ({
      matches: /prefers-reduced-motion/.test(q),
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
    });
    const Flash = await loadFlash();
    const { container } = render(<Flash onPrimary={() => {}} onDismiss={() => {}} />);
    // No SVG stroke-draw animation should be present.
    expect(container.querySelectorAll('animate, animateTransform').length).toBe(0);
    const html = container.innerHTML;
    expect(html).not.toMatch(/stroke-dashoffset:\s*[^0]/i);
  });
});
