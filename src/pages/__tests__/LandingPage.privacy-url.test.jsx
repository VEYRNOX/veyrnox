// src/pages/__tests__/LandingPage.privacy-url.test.jsx
//
// Pins that the public /landing page's footer links to REAL legal URLs (not the
// original `href="#"` placeholder). The dead-link regression was the primary
// reason the Play store listing had no in-app privacy policy surface.
//
// 2026-09-16 — THIS TEST PREVIOUSLY PINNED A DEAD LINK AS CORRECT. It asserted
// `href === '/terms'` and its own comment called that "the in-app /terms route".
// There is no such route: App.jsx declares `/terms-legal`, and `/terms` fell
// through to the `*` catch-all and rendered PageNotFound. The assertion was
// green the whole time because it only compared the attribute to a string — it
// never checked the target resolved. Both legal links are now absolute URLs on
// veyrnox.com (a separate site, per CLAUDE.md). Verified live 2026-09-16: both
// resolve 200, and /terms-of-service returns 404, so those 200s are real pages
// rather than a catch-all.
//
// Bare path, NO trailing slash, even though it 307s to the slashed form: these
// are the exact strings on the store listings, and TermsLegal.privacy-url.test.jsx
// pins the privacy one for that reason. Do not "canonicalise" them here.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';

// LandingPage transitively imports Capacitor + a bunch of animation modules.
// This test only cares about the Legal footer, so we mock the surface we need.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

const LandingPage = (await import('../LandingPage')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage — Legal footer links wired', () => {
  it('Privacy Policy link points at https://veyrnox.com/privacy (the store-listing string)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Privacy Policy/i });
    expect(link.getAttribute('href')).toBe('https://veyrnox.com/privacy');
    expect(link.getAttribute('href')).not.toBe('#');
  });

  it('Privacy Policy link opens externally with rel="noopener noreferrer"', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Privacy Policy/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('Terms of Service link points at https://veyrnox.com/terms (absolute, not the dead /terms route)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Terms of Service/i });
    expect(link.getAttribute('href')).toBe('https://veyrnox.com/terms');
    expect(link.getAttribute('href')).not.toBe('#');
  });

  it('Terms of Service link opens externally with rel="noopener noreferrer"', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Terms of Service/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  // The actual regression guard, and the thing the old string comparison could
  // not express: no footer link may point at a same-origin path that the router
  // does not declare. `/terms` passed a `toBe('/terms')` check for months while
  // rendering the 404 page.
  it('no footer link points at a relative path the router does not route', () => {
    const { container } = renderPage();
    const footer = container.querySelector('footer');
    if (!footer) throw new Error('landing footer did not render');
    const relativeHrefs = [...footer.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/'));
    // /veyrnox-docs.html is a static file in public/, served by the host, not
    // by the router — it is the one legitimate same-origin non-route.
    const unroutable = relativeHrefs.filter((href) => href !== '/veyrnox-docs.html');
    expect(unroutable).toEqual([]);
  });
});
