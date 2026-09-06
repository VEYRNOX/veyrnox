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

// Added 2026-09-07. Each pins a FACT the policy must state, worded to survive
// rewording of the copy. The claims themselves were fixed in #2378; nothing
// pinned them, so this exists so they cannot silently regress.
//
// The trigger's accessible name carries the section NUMBER; the panel's does
// not (TermsSection sets aria-label={title}). One pattern will not match both.
function openByTitle(title) {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: new RegExp('\\d+\\.\\s*' + title, 'i') }));
  return screen.getByRole('region', { name: new RegExp(title, 'i') }).textContent.replace(/\s+/g, ' ');
}

describe('Terms & legal — claims that must keep matching the code', () => {
  it('does not deny website ad-tracking, and names what the site runs', () => {
    // veyrnox.com runs GTM + a Reddit ad pixel. The app denied this until #2378.
    const text = openByTitle('cookies & anonymous usage events');
    expect(text).not.toMatch(/website uses no advertising or third-party tracking cookies/i);
    expect(text).toMatch(/Google Tag Manager/i);
    expect(text).toMatch(/Reddit advertising pixel/i);
  });

  it('states that pre-send address screening is paid-tier only', () => {
    // SendCrypto.jsx gates it on hasAdvisorOnlineAccess(currentTier).
    expect(openByTitle('recipient address screening')).toMatch(/AI Security Protection/i);
  });

  it('discloses the install identifier the Advisor sends', () => {
    // SecurityAdvisor.jsx:1387 sends device_id on every chat call.
    expect(openByTitle('ai security advisor')).toMatch(/device_id/i);
  });

  it('says the identifier is a rate limit, not personalisation', () => {
    // The code comment is explicit: a per-device cap of 30 turns / 24h. An
    // earlier draft of this section said it kept the conversation coherent,
    // which describes a purpose the payload does not serve.
    const text = openByTitle('ai security advisor');
    expect(text).toMatch(/per-device daily limit/i);
    expect(text).not.toMatch(/keep the conversation coherent/i);
  });

  it('does not claim wallet-shell context is sent with Advisor messages', () => {
    // #2349 cut the page snapshot at the egress boundary; only current_screen
    // and wallet_chain leave the device.
    expect(openByTitle('ai security advisor')).not.toMatch(/counts and whether the wallet is locked/i);
  });

  it('admits the Solana screening payload carries the sender address', () => {
    // sol/send.js:216 builds the unsigned tx with feePayer: fromPubkey, and
    // SendCrypto sends that serialised tx to the screening proxy. "Your own
    // address is never sent" is therefore false on Solana — the caveat is the
    // whole point of this pin.
    // NOT /Solana/i — the word survives elsewhere in this section ("for
    // Solana, the serialised transaction"), so that matcher stayed green with
    // the caveat deleted. Pin the claim, not a word that happens to co-occur.
    expect(openByTitle('recipient address screening'))
      .toMatch(/present inside the Solana transaction/i);
  });
});
