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

  // The page must still say what it says without the mascot: in a decoy
  // session Vigil renders null, and the notice has to survive that intact.
  it('keeps heading, body and the plans link when Vigil gates itself out', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { container, getByText } = render(<TierLockedPage />);
    expect(container.querySelector('[data-vigil]')).toBeNull();
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
    ['BackupPaywallNudge.jsx'],
    ['TierLockedPage.jsx'],
  ])('%s renders Vigil only as asleep', async (file) => {
    const text = await src(file);
    const states = [...text.matchAll(CALL)].map((m) => m[1]);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((st) => st === 'asleep')).toBe(true);
  });
});

describe('NotificationToast stays mascot-free', () => {
  // This is a deliberate omission, not an oversight, and it is pinned so the
  // next person does not "finish the job".
  //
  // NotificationToast declares its own I3 invariant at the top of the file:
  // the toast is structurally identical in real and decoy sessions. Vigil
  // renders null in a decoy session by design, so putting it in the toast
  // would make the real and decoy toasts visibly different — a tell for
  // anyone who has seen both. The per-level lucide glyph already carries the
  // severity, so the mascot would buy a brand moment at the cost of a stated
  // security invariant.
  //
  // If this is ever revisited, the invariant comment in NotificationToast.jsx
  // has to change in the SAME commit, with the threat model written down.
  it('imports no mascot', async () => {
    const text = await src('NotificationToast.jsx');
    expect(text).not.toMatch(/^import Vigil/m);
    expect(text).not.toMatch(/<Vigil\b/);
  });

  it('still declares the invariant that keeps it out', async () => {
    const text = await src('NotificationToast.jsx');
    expect(text).toMatch(/structurally identical in real and decoy modes/);
  });
});
