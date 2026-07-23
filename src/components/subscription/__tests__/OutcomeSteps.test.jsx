// @ts-nocheck
// Guards the coercion-resistance caveat on the outcome-first paywall.
//
// Why this needs a test: the S-1 finding (2026-07-20 weekly audit) was exactly
// this class of regression — user-facing security caveats stripped from
// Documentation by PR #1243. Duress mode is runtime deniability, NOT
// hidden-volume storage: a forensic examination can still show a second vault
// exists. This is the screen where someone under real threat decides whether to
// rely on it, so an unqualified "reveals nothing" claim here is the most
// consequential place that caveat could go missing.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import OutcomeSteps, { OUTCOME_STEPS } from '../OutcomeSteps';

const noop = () => {};

describe('OutcomeSteps — coercion claim carries its limit', () => {
  it('the coercion step exists and is first', () => {
    expect(OUTCOME_STEPS[0].key).toBe('coercion');
  });

  it('the coercion step states the forensic limit', () => {
    const step = OUTCOME_STEPS.find((s) => s.key === 'coercion');
    expect(step.limit).toBeTruthy();
    expect(step.limit).toMatch(/forensic/i);
    // must not claim hidden-volume/plausible-deniability-at-rest
    expect(step.limit).toMatch(/not hidden-volume/i);
  });

  it('renders the limit visibly alongside the claim, not as hidden text', () => {
    render(<OutcomeSteps step={0} onNext={noop} onBack={noop} onSkip={noop} />);
    const limit = screen.getByText(/forensic examination/i);
    expect(limit).toBeTruthy();
    // rendered at body size on purpose — a caveat a coerced user cannot read
    // is not a caveat
    expect(limit.className).toMatch(/text-sm/);
    expect(limit.className).not.toMatch(/sr-only|hidden/);
  });

  it('every step that makes a qualified claim declares its limit explicitly', () => {
    // `limit` must be present on every step object (null is an explicit
    // "no caveat needed"), so a new step cannot silently omit the decision.
    for (const s of OUTCOME_STEPS) {
      expect(Object.prototype.hasOwnProperty.call(s, 'limit')).toBe(true);
    }
  });

  it('is skippable — the preamble never traps the user away from pricing', () => {
    render(<OutcomeSteps step={0} onNext={noop} onBack={noop} onSkip={noop} />);
    expect(screen.getByText(/skip to pricing/i)).toBeTruthy();
  });
});
