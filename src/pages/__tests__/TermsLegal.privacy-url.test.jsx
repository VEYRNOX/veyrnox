// src/pages/__tests__/TermsLegal.privacy-url.test.jsx
//
// Pin two things that Play/App Store submission depend on:
//   1. The Terms & legal screen (Settings → Terms & legal, reachable on every platform)
//      links out to the authoritative privacy policy URL — Play's crypto-app policy
//      review actively checks whether the app itself surfaces a privacy policy.
//   2. The URL is exactly `https://veyrnox.com/privacy` — the same string submitted on
//      the store listings. Drift here means a reviewer's click resolves to a page that
//      is not the one they read from the store form.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import TermsLegal from '../TermsLegal';

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsLegal />
    </MemoryRouter>
  );
}

describe('Terms & legal — privacy policy URL wired', () => {
  it('renders a Privacy policy section (heading present)', () => {
    renderPage();
    // The heading appears in a section title; the body prose also mentions
    // "privacy policy", so we match at least one occurrence rather than exactly one.
    expect(screen.getAllByText(/Privacy policy/i).length).toBeGreaterThan(0);
  });

  it('links to the exact authoritative URL https://veyrnox.com/privacy', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /veyrnox\.com\/privacy/i });
    expect(link.getAttribute('href')).toBe('https://veyrnox.com/privacy');
  });

  it('opens in a new tab with rel="noopener noreferrer" (native + web safe)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /veyrnox\.com\/privacy/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
