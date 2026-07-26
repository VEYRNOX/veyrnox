// src/pages/__tests__/TermsLegal.telemetry-disclosure.test.jsx
//
// The in-app privacy policy has to describe what the app ACTUALLY sends. It
// previously predated the consent gate: it described recording as
// unconditional and listed only the original 7 events, while the shipped app
// also sent send-flow steps, paywall prompts, referral codes and more.
//
// These assertions are about substance, not wording — each pins a claim that
// would be materially misleading if the policy drifted from the code:
//   - consent is opt-in, and declining sends nothing and mints no identifier
//   - there is a way to change your mind (Settings -> Privacy), which exists
//   - balances/amounts are never transmitted (useFirstInbound sends no balance)
//   - the referral code itself is sent (referralAttribution.js includes it)
//
// §9 lives in a collapsed accordion panel, so it has to be expanded first —
// same pattern as TermsLegal.accordion-a11y.test.jsx.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import TermsLegal from '../TermsLegal';

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsLegal />
    </MemoryRouter>
  );
}

/** Expand §9 and return its panel text. */
function openSection9() {
  renderPage();
  const trigger = screen.getByRole('button', { name: /9\.\s*cookies & anonymous usage events/i });
  fireEvent.click(trigger);
  const region = screen.getByRole('region', { name: /cookies & anonymous usage events/i });
  return region.textContent.replace(/\s+/g, ' ');
}

describe('Terms & legal — telemetry disclosure matches the app', () => {
  // Visible without expanding anything: the summary at the top of the policy.
  it('says up front that recording happens only if you opt in', () => {
    renderPage();
    expect(screen.getAllByText(/only if you opt in/i).length).toBeGreaterThan(0);
  });

  it('states that declining sends nothing and creates no identifier', () => {
    expect(openSection9()).toMatch(/no event is sent and no install identifier is even created/i);
  });

  it('points at the Settings control that exists', () => {
    expect(openSection9()).toMatch(/Settings\s*→\s*Privacy/i);
  });

  it('promises balances and amounts are never sent, with no bucketing exception', () => {
    expect(openSection9()).toMatch(/not bucketed, not rounded, not sent at all/i);
  });

  // Disclosed because referralAttribution.js sends { code, source }. If the
  // code stops being sent this can relax — but it must never be undisclosed
  // while it is being sent.
  it('discloses that an applied referral code itself is transmitted', () => {
    expect(openSection9()).toMatch(/a referral code was applied, and the code itself/i);
  });

  it('discloses the send-flow and paywall events, not just the original seven', () => {
    const text = openSection9();
    expect(text).toMatch(/a send was started, reached a given step, was abandoned, or completed/i);
    expect(text).toMatch(/a subscription prompt was shown, dismissed, or accepted/i);
  });

  it('still states that decoy and demo sessions send nothing at all', () => {
    expect(openSection9()).toMatch(/nothing is recorded in decoy \(duress\) sessions or in demo mode/i);
  });
});
