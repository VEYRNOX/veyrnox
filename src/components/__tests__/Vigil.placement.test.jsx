// src/components/__tests__/Vigil.placement.test.jsx
//
// Where Vigil is allowed to appear, and — more importantly — where it is not.
//
// The component self-gates on deniability (see Vigil.test.jsx), so these pins
// are not about the gate. They are about PLACEMENT, which is a judgement each
// call site makes and can therefore get wrong quietly:
//
//   1. a paywall surface shows `asleep`, never a sad or pleading variant, and
//      never `clean` — `clean` on a locked feature claims protection the user
//      has not paid for (I4).
//   2. NotificationToast stays mascot-free. See the block at the bottom.
//
// Mutation-checked 2026-09-16: each pin confirmed red by making the specific
// change it forbids, then restored.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('react-router', () => ({
  Link: ({ children, ...rest }) => <a {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const { default: TierLockedPage } = await import('@/components/TierLockedPage');
const { default: RiskShield } = await import('@/components/RiskShield');
const { isDeniabilityOrDemoActive } = await import('@/wallet-core/deniabilitySession');

const src = (file) => readFile(resolve(process.cwd(), 'src/components', file), 'utf8');

beforeEach(() => {
  isDeniabilityOrDemoActive.mockReturnValue(false);
  localStorage.clear();
});

describe('TierLockedPage', () => {
  it('shows Vigil asleep — the feature is paywalled, so protection is not running', () => {
    const { container } = render(<TierLockedPage />);
    const svg = container.querySelector('[data-vigil]');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-vigil')).toBe('asleep');
    // never announced — the notice text is the accessible signal
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows Vigil asleep on the AI tier variant too', () => {
    const { container } = render(<TierLockedPage tier="ai_security_protection" />);
    expect(container.querySelector('[data-vigil="asleep"]')).not.toBeNull();
  });

  // A decoy session must be indistinguishable from a primary one, so the
  // locked page looks the same in both — mascot included.
  it('renders the same in a decoy session as in a primary one', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { container, getByText } = render(<TierLockedPage />);
    expect(container.querySelector('[data-vigil="asleep"]')).not.toBeNull();
    expect(getByText('Safety Plus feature')).toBeTruthy();
    expect(getByText('View plans')).toBeTruthy();
  });
});

describe('paywall surfaces use the asleep state', () => {
  // Scoped to the JSX call, not to the word "Vigil": all three files discuss
  // the mascot in comments, and an unscoped search would match the prose that
  // documents this very rule and pass for the wrong reason.
  const CALL = /<Vigil\s+state="([a-z]+)"/g;

  it.each([
    ['PaywallNudge.jsx'],
    ['WinPaywall.jsx'],
    ['BackupNagSheet.jsx'],
    ['TierLockedPage.jsx'],
  ])('%s renders Vigil only as asleep', async (file) => {
    const text = await src(file);
    const states = [...text.matchAll(CALL)].map((m) => m[1]);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((st) => st === 'asleep')).toBe(true);
  });
});

describe('NotificationToast stays mascot-free', () => {
  // Still a deliberate omission, but the REASON changed and the old one is
  // recorded here because it was wrong.
  //
  // It used to be: Vigil rendered null in a decoy session, so putting it in the
  // toast would have broken the invariant this file declares — "the toast is
  // structurally identical in real and decoy modes". Vigil no longer gates on
  // deniability at all, so that blocker is gone. The toast could take the
  // mascot today without touching its invariant.
  //
  // What survives is the narrower judgement: `info` carries ordinary
  // confirmations, and a mascot on "copied to clipboard" is the fastest way to
  // teach someone to ignore it on the one that matters. Any future wiring is
  // caution/risk ONLY, never info — and the per-level lucide glyph stays, since
  // it is what carries severity when the toast is scanned rather than read.
  //
  // This pin is now a scope fence, not a safety gate. Removing it is a design
  // decision someone can make; it is not a security regression.
  it('imports no mascot', async () => {
    const text = await src('NotificationToast.jsx');
    expect(text).not.toMatch(/^import Vigil/m);
    expect(text).not.toMatch(/<Vigil\b/);
  });

  it('still declares its own structural-identity invariant', async () => {
    const text = await src('NotificationToast.jsx');
    expect(text).toMatch(/structurally identical in real and decoy modes/);
  });
});

describe('RiskShield — the severity to expression mapping', () => {
  // The contract between the risk model and the character. This is a signing
  // chokepoint: a BLOCK verdict drawing a calm owl is a security-copy
  // regression, not a cosmetic one.
  it.each([
    ['block', 'block'],
    ['warn', 'alert'],
    ['clean', 'clean'],
  ])('severity %s draws Vigil %s', (severity, expected) => {
    const { container } = render(<RiskShield severity={severity} />);
    expect(container.querySelector('[data-vigil]').getAttribute('data-vigil')).toBe(expected);
  });

  it('falls back to warn for an unknown severity, never to clean', () => {
    const { container } = render(<RiskShield severity="nonsense" />);
    expect(container.querySelector('[data-vigil]').getAttribute('data-vigil')).toBe('alert');
  });

  it('shows the risk verdict in a decoy session too', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { container } = render(<RiskShield severity="block" />);
    expect(container.querySelector('[data-vigil="block"]')).not.toBeNull();
  });

  // Vigil is static by design. The rings are the urgency signal at the
  // chokepoint, and swapping them out for a still character would have
  // downgraded a BLOCK warning from moving to still without anyone noticing.
  it('keeps its pulsing rings — Vigil replaces the glyph, not the motion', async () => {
    const text = await src('RiskShield.jsx');
    expect(text).toMatch(/repeat: Infinity/);
    expect(text).toMatch(/duration: 1\.4/);
  });
});
