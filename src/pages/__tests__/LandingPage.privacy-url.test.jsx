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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Captures every navigate() the page performs, so the footer guard below can
// cover BUTTONS, not just anchors — see the comment on that test.
const navSpy = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  /** @type {Record<string, unknown>} */
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navSpy };
});

// jsdom implements neither; the landing page calls both when scrolling.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(here, '../../App.jsx'), 'utf8');
// Every path the router declares, redirects included: a redirect still
// RESOLVES, and a link to one is not broken.
const DECLARED_ROUTES = new Set(
  [...appSrc.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
);

// The routes nested under <Route element={<Layout />}> — which itself sits
// inside <Route element={<WalletGate />}>. These require an unlocked vault.
//
// This is the predicate that actually matters on THIS page, and getting it
// wrong is easy: /docs and /security are perfectly well DECLARED, so a
// "does the router know this path" check calls them fine. But LandingGuard
// renders /landing only on a device with NO vault, so a landing link into a
// gated route always lands on the create/import front door instead of the
// page named on the link. Reachability, not declaration, is the test.
// (Same extraction as lib/__tests__/routeAudit.test.js: all children are
// self-closing, so the first </Route> after the opening tag is Layout's own.)
const LAYOUT_MARKER = 'element={<Layout />}>';
const layoutStart = appSrc.indexOf(LAYOUT_MARKER);
const layoutBlock =
  layoutStart === -1
    ? ''
    : appSrc.slice(layoutStart + LAYOUT_MARKER.length, appSrc.indexOf('</Route>', layoutStart));
const GATED_ROUTES = new Set(
  [...layoutBlock.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
);

// Static files under public/ are served by the host, not the router.
const STATIC_FILES = new Set(['/veyrnox-docs.html']);

/** A landing-page target is bad if it resolves nowhere, or needs a vault. */
function unreachableFromLanding(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return false;
  if (STATIC_FILES.has(target)) return false;
  if (GATED_ROUTES.has(target)) return true;   // needs an unlocked vault
  return !DECLARED_ROUTES.has(target);          // resolves nowhere
}

// LandingPage transitively imports Capacitor + a bunch of animation modules.
// This test only cares about the Legal footer, so we mock the surface we need.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

const LandingPage = (await import('../LandingPage')).default;

beforeEach(() => {
  navSpy.mockClear();
});

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

  // The actual regression guard, and the thing a `toBe('/terms')` check could
  // not express: no footer control may lead somewhere a visitor on this page
  // cannot get to. Two different failures are covered — `/terms` resolved
  // nowhere and rendered the 404 page, while `/docs` and `/security` resolved
  // fine but sit behind WalletGate, which /landing by definition cannot pass.
  //
  // It covers BUTTONS as well as anchors deliberately. The other dead control
  // this PR removed was `<button onClick={() => navigate('/security')}>` — an
  // anchor-only sweep leaves that exact shape uncovered, so restoring it would
  // keep the guard green. Buttons are exercised by clicking them and reading
  // what navigate() was asked for.
  it('no footer ANCHOR points somewhere a vault-less visitor cannot reach', () => {
    const { container } = renderPage();
    const footer = container.querySelector('footer');
    if (!footer) throw new Error('landing footer did not render');
    const unreachable = [...footer.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter(unreachableFromLanding);
    expect(unreachable).toEqual([]);
  });

  it('no footer BUTTON navigates somewhere a vault-less visitor cannot reach', () => {
    const { container } = renderPage();
    const footer = container.querySelector('footer');
    if (!footer) throw new Error('landing footer did not render');
    const buttons = [...footer.querySelectorAll('button')];
    // Sentinel: the footer's in-page links are buttons. If this ever reaches
    // zero the assertion below passes vacuously.
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) fireEvent.click(b);
    const unreachable = navSpy.mock.calls.map(([to]) => to).filter(unreachableFromLanding);
    expect(unreachable).toEqual([]);
  });

  it('parsed a plausible route table out of App.jsx', () => {
    // Without this, a regex that stops matching turns both guards vacuous:
    // an empty DECLARED_ROUTES would make every link look unroutable, and a
    // parse that throws would take the file down — but a partial parse would
    // silently narrow the set. Assert the shape we expect.
    expect(DECLARED_ROUTES.size).toBeGreaterThan(50);
    expect(DECLARED_ROUTES.has('/terms-legal')).toBe(true);
    expect(DECLARED_ROUTES.has('/terms')).toBe(false);
    // The gated set must be real and must contain the two routes this PR
    // unwired from the footer, or the reachability guard is decoration.
    expect(GATED_ROUTES.size).toBeGreaterThan(50);
    expect(GATED_ROUTES.has('/security')).toBe(true);
    expect(GATED_ROUTES.has('/docs')).toBe(true);
  });
});
