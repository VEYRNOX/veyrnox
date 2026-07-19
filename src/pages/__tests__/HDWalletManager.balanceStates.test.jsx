// Behavioural a11y tests for the shared balance state components.
//
// The sibling HDWalletManager.a11yMono.test.js pins the SOURCE (that the
// attributes are present and not duplicated across the three readers). This
// file asserts the rendered DOM instead — that the accessible name actually
// reaches the accessibility tree, which a source grep cannot prove.
//
// Findings F6/F7 from the 2026-07-19 branch review: the error state carried its
// meaning only in a `title` on a non-interactive span (not reliably announced,
// keyboard-unreachable), and the transient states had no live region, so the
// async resolve was silent to assistive tech.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalancePending, BalanceUnavailable } from '../HDWalletManager.jsx';

/**
 * querySelector for assertions. Presence is asserted separately, so the cast
 * keeps the checker quiet without an `@ts-nocheck` over the whole file.
 * @param {HTMLElement} container
 * @param {string} sel
 * @returns {any}
 */
const q = (container, sel) => /** @type {any} */ (container.querySelector(sel));

describe('BalancePending', () => {
  it('exposes an accessible name instead of a bare ellipsis', () => {
    render(<BalancePending />);
    expect(screen.getByText('Loading balance')).toBeTruthy();
  });

  it('is a polite live region so the state change is announced', () => {
    const { container } = render(<BalancePending />);
    const status = q(container, '[role="status"]');
    expect(status).toBeTruthy();
  });

  it('hides the decorative ellipsis glyph from assistive tech', () => {
    const { container } = render(<BalancePending />);
    const hidden = q(container, '[aria-hidden="true"]');
    expect(hidden).toBeTruthy();
    expect(hidden.textContent).toBe('…');
  });
});

describe('BalanceUnavailable', () => {
  it('states the error in real text, not only a title attribute', () => {
    render(<BalanceUnavailable />);
    expect(screen.getByText('Balance unavailable')).toBeTruthy();
  });

  it('is a polite live region', () => {
    const { container } = render(<BalanceUnavailable />);
    expect(q(container, '[role="status"]')).toBeTruthy();
  });

  it('hides the decorative em-dash from assistive tech', () => {
    const { container } = render(<BalanceUnavailable />);
    const hidden = q(container, '[aria-hidden="true"]');
    expect(hidden).toBeTruthy();
    expect(hidden.textContent).toBe('—');
  });

  it('keeps the title as a sighted-mouse affordance (additive, not the only channel)', () => {
    const { container } = render(<BalanceUnavailable />);
    const status = q(container, '[role="status"]');
    expect(status.getAttribute('title')).toBe('Could not read balance from chain');
    // …but the meaning is ALSO in text, which is the actual fix.
    expect(status.textContent).toContain('Balance unavailable');
  });

  it('the accessible text is not the em-dash alone', () => {
    const { container } = render(<BalanceUnavailable />);
    // Strip the aria-hidden glyph; what remains must be meaningful.
    const status = q(container, '[role="status"]');
    const visibleToAt = [...status.childNodes]
      .filter(n => !(n.nodeType === 1 && /** @type {any} */ (n).getAttribute('aria-hidden') === 'true'))
      .map(n => n.textContent)
      .join('')
      .trim();
    expect(visibleToAt).toBe('Balance unavailable');
  });
});
