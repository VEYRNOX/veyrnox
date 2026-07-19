// Regression guard: the command palette must stay reachable on EVERY mobile route.
//
// Bug (branch eaf7361a, "remove duplicate search"): the mobile header search
// button was deleted. It lived in the `md:hidden` Mobile Top Bar, which renders
// on every mobile route. After the deletion the only remaining triggers were:
//   - Layout.jsx :213 / :223  — inside `<aside className="hidden md:flex …">`, DESKTOP ONLY
//   - Layout.jsx :429         — the search pill inside tab-panel-0, gated
//                               `hidden={!MOBILE_TABS.includes(pathname) || mobileTab !== '/'}`
//                               i.e. the HOME tab only
//   - ⌘K / Ctrl-K keydown     — needs a hardware keyboard
// Net: on mobile Send, Receive, any sub-page, and the More drawer, there was no
// way to open the command palette at all.
//
// The deletion was not wrong in spirit — on Home the header icon AND the pill
// both existed, which IS a duplicate. The fix keeps that de-duplication but
// restores the icon everywhere the pill is not rendered.
//
// Invariant: for any mobile route, exactly one of {header search icon, home
// search pill} is present — never zero, never both.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shouldShowHeaderSearch, isHomeSearchPillVisible } from '../Layout.jsx';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../Layout.jsx'), 'utf8');

// Routes that host the mobile tab shell.
const MOBILE_TABS = ['/', '/send', '/receive'];
// Representative non-tab routes (sub-pages / More-drawer destinations).
const SUB_PAGES = ['/settings', '/hd-wallet', '/tx-history', '/wallet-access', '/features'];

describe('isHomeSearchPillVisible — mirrors the tab-panel-0 hidden gate', () => {
  it('is visible only when on a mobile tab route AND the Home tab is selected', () => {
    expect(isHomeSearchPillVisible('/', '/')).toBe(true);
    expect(isHomeSearchPillVisible('/send', '/')).toBe(true);
    expect(isHomeSearchPillVisible('/receive', '/')).toBe(true);
  });

  it('is hidden when a non-Home tab is selected', () => {
    expect(isHomeSearchPillVisible('/send', '/send')).toBe(false);
    expect(isHomeSearchPillVisible('/receive', '/receive')).toBe(false);
  });

  it('is hidden on every non-tab route', () => {
    for (const p of SUB_PAGES) {
      expect(isHomeSearchPillVisible(p, '/')).toBe(false);
    }
  });
});

describe('shouldShowHeaderSearch — the actual regression', () => {
  // The bug: these all had NO search entry point.
  it('shows the header icon on non-Home mobile tabs', () => {
    expect(shouldShowHeaderSearch('/send', '/send')).toBe(true);
    expect(shouldShowHeaderSearch('/receive', '/receive')).toBe(true);
  });

  it('shows the header icon on every sub-page / More-drawer destination', () => {
    for (const p of SUB_PAGES) {
      expect(shouldShowHeaderSearch(p, '/')).toBe(true);
    }
  });

  // Preserves the original commit's intent.
  it('hides the header icon where the Home pill already provides search', () => {
    expect(shouldShowHeaderSearch('/', '/')).toBe(false);
    expect(shouldShowHeaderSearch('/send', '/')).toBe(false);
    expect(shouldShowHeaderSearch('/receive', '/')).toBe(false);
  });

  it('never leaves a route with zero search entry points, and never duplicates', () => {
    const routes = [...MOBILE_TABS, ...SUB_PAGES];
    const tabStates = ['/', '/send', '/receive'];
    for (const pathname of routes) {
      for (const mobileTab of tabStates) {
        const header = shouldShowHeaderSearch(pathname, mobileTab);
        const pill = isHomeSearchPillVisible(pathname, mobileTab);
        // exactly one — XOR
        expect(header !== pill).toBe(true);
      }
    }
  });

  it('is defensive about missing arguments (fails toward showing search)', () => {
    expect(shouldShowHeaderSearch(undefined, undefined)).toBe(true);
  });
});

describe('Layout — header search wiring', () => {
  it('the mobile header renders a search trigger again', () => {
    expect(src).toMatch(/shouldShowHeaderSearch\s*\(/);
  });

  it('the restored trigger opens the command palette and is labelled', () => {
    // Guarded button, with an accessible name (the icon itself is decorative).
    expect(src).toMatch(/aria-label="Search"/);
    expect(src).toMatch(/setCmdOpen\(true\)/);
  });

  it('keeps the Home search pill (it is the other half of the XOR)', () => {
    expect(src).toMatch(/Search features, pages/);
  });
});
