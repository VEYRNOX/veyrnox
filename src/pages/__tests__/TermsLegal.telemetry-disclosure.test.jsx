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

// Section number changed 9 → 11 on 2026-09-06 when two new sections
// (AI Security Advisor, Recipient Address Screening) were inserted before it.
// The match is loose on the leading number so a future reshuffle doesn't
// silently re-hide this content behind a stale digit.
function openCookiesSection() {
  renderPage();
  const trigger = screen.getByRole('button', { name: /\d+\.\s*cookies & anonymous usage events/i });
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
    expect(openCookiesSection()).toMatch(/no event is sent and no install identifier is even created/i);
  });

  it('points at the Settings control that exists', () => {
    expect(openCookiesSection()).toMatch(/Settings\s*→\s*Privacy/i);
  });

  it('promises balances and amounts are never sent, with no bucketing exception', () => {
    expect(openCookiesSection()).toMatch(/not bucketed, not rounded, not sent at all/i);
  });

  // Disclosed because referralAttribution.js sends { code, source }. If the
  // code stops being sent this can relax — but it must never be undisclosed
  // while it is being sent.
  it('discloses that an applied referral code itself is transmitted', () => {
    expect(openCookiesSection()).toMatch(/a referral code was applied, and the code itself/i);
  });

  it('discloses the send-flow and paywall events, not just the original seven', () => {
    const text = openCookiesSection();
    expect(text).toMatch(/a send was started, reached a given step, was abandoned, or completed/i);
    expect(text).toMatch(/a subscription prompt was shown, dismissed, or accepted/i);
  });

  it('still states that decoy and demo sessions send nothing at all', () => {
    expect(openCookiesSection()).toMatch(/nothing is recorded in decoy \(duress\) sessions or in demo mode/i);
  });
});

// Added 2026-09-07. Each of these pins a sentence that was WRONG in the shipped
// app until this change, found by rendering veyrnox.com and diffing it against
// the code. They are worded to fail if the old claim comes back, not merely if
// wording drifts — the point is the fact, not the phrasing.
// The trigger's accessible name carries the section NUMBER; the panel's does not
// (TermsSection sets aria-label={title}). Matching one pattern against both is
// why the first draft of these tests failed.
function openSection(title) {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: new RegExp('\\d+\\.\\s*' + title, 'i') }));
  return screen.getByRole('region', { name: new RegExp(title, 'i') }).textContent.replace(/\s+/g, ' ');
}

describe('Terms & legal — claims that must match what the code actually does', () => {
  it('does not deny website ad-tracking, and names what the site actually runs', () => {
    const text = openSection('cookies & anonymous usage events');
    // The false claim. veyrnox.com runs GTM + a Reddit ad pixel.
    expect(text).not.toMatch(/website uses no advertising or third-party tracking cookies/i);
    expect(text).toMatch(/Google Tag Manager/i);
    expect(text).toMatch(/Reddit advertising pixel/i);
  });

  it('states that pre-send address screening is paid-tier only', () => {
    // SendCrypto.jsx gates it on hasAdvisorOnlineAccess(currentTier); the policy
    // used to read as though every user got the online check.
    expect(openSection('recipient address screening'))
      .toMatch(/only on the paid AI Security Protection tier/i);
  });

  it('discloses the install identifier the Advisor sends', () => {
    // SecurityAdvisor.jsx sends device_id: getOrCreateDeviceId() on every chat call.
    expect(openSection('ai security advisor'))
      .toMatch(/same random install identifier/i);
  });

  it('does not claim wallet-shell context is sent with Advisor messages', () => {
    // PR #2349 cut the page snapshot at the egress boundary; only current_screen
    // and wallet_chain go out. Re-adding that claim without re-adding the payload
    // would describe an egress that does not happen, and vice versa.
    const text = openSection('ai security advisor');
    expect(text).not.toMatch(/counts and whether the wallet is locked/i);
    expect(text).toMatch(/exactly two pieces of context/i);
  });
});
