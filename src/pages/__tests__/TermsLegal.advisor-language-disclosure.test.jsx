// src/pages/__tests__/TermsLegal.advisor-language-disclosure.test.jsx
//
// §9 enumerates the Advisor payload exhaustively — "we send N small pieces of
// context", then names them. An exhaustive list is only honest while it stays
// complete, and until 2026-09-09 it said TWO while the wire carried THREE:
// SecurityAdvisor.jsx builds the system prompt with
//
//     Current app language: ${currentLanguageName} (${currentLanguage})
//
// alongside current_screen and wallet_chain. The locale is low-sensitivity,
// but §9 was rewritten in #2378 specifically to be exhaustive, and
// SecurityAdvisor.jsx's own egress comment forbids widening the prompt
// without updating the disclosure. A count that is quietly wrong is the same
// class of defect as the address claim fixed in #2461.
//
// These two assertions must move together. If the language is ever dropped
// from the prompt, this test goes red and the fix is to update §9 to match —
// not to loosen the test.
//
// §9 lives in a collapsed accordion panel, so it has to be expanded first —
// same pattern as TermsLegal.telemetry-disclosure.test.jsx. Asserting on
// RENDERED TEXT rather than file contents is deliberate: a source-text
// assertion would also match the comments that describe the payload, which
// is how an absence/presence check ends up firing on its own documentation.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import TermsLegal from '../TermsLegal';

// Loose on the leading digit so a future section reshuffle does not silently
// re-hide this content behind a stale number.
function openAdvisorSection() {
  render(
    <MemoryRouter>
      <TermsLegal />
    </MemoryRouter>
  );
  const trigger = screen.getByRole('button', { name: /\d+\.\s*ai security advisor/i });
  fireEvent.click(trigger);
  const region = screen.getByRole('region', { name: /ai security advisor/i });
  return region.textContent.replace(/\s+/g, ' ');
}

/** SecurityAdvisor.jsx source with `//` comment lines removed. */
function advisorSourceWithoutComments() {
  const file = path.resolve(__dirname, '../../components/SecurityAdvisor.jsx');
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('Terms & legal §9 — Advisor context disclosure matches the payload', () => {
  it('the system prompt still carries the app language', () => {
    // Structural: the interpolated template line inside the prompt literal,
    // not prose about it.
    expect(advisorSourceWithoutComments()).toContain(
      'Current app language: ${currentLanguageName} (${currentLanguage})'
    );
  });

  it('§9 discloses the display language as context that is sent', () => {
    const text = openAdvisorSection();
    expect(text).toMatch(/display language/i);
  });

  it('§9 counts three pieces of context, not two', () => {
    const text = openAdvisorSection();
    expect(text).toMatch(/three small pieces of context/i);
    expect(text).not.toMatch(/two small pieces of context/i);
  });

  it('§9 still names the other two by their wire keys', () => {
    const text = openAdvisorSection();
    expect(text).toContain('current_screen');
    expect(text).toContain('wallet_chain');
  });

  it('§9 does not claim the language is unrelated to the device', () => {
    // resolveLocale() falls back to navigator.language when the user has
    // never picked one in Settings, so the tag CAN be device-derived and the
    // policy must not say otherwise.
    const text = openAdvisorSection();
    expect(text).not.toMatch(/never your device/i);
  });
});
