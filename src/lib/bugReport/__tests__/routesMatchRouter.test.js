// The pin that would have caught the original defect.
//
// recordableRoutes.js shipped an allowlist and a denylist written against a
// route table this app does not have: of 24 literals only 3 were real, and all
// 16 denylist entries matched zero routes. The module's own test suite could not
// see it — it was thorough and mutation-checked on the MATCHING LOGIC, and every
// path it asserted (`/seed/reveal`, `/panic/erase`, `/duress/setup`,
// `/wc/session-request`) was invented. Module, tests and design doc agreed with
// each other and none of them agreed with src/App.jsx.
//
// So this file asserts the one property the others structurally cannot: every
// literal in both lists corresponds to a route the router actually declares.
// It is deliberately the ONLY test here that reads App.jsx — the others test
// behaviour, this one tests correspondence with reality.
//
// A route entry counts as corresponding if it is either an exact declared path
// or a segment-boundary prefix of one (`/onboarding` → `/onboarding/restore-shares`,
// `/dev` → `/dev/prf-spike`), because those are the two forms canRecordOnRoute
// itself matches on.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { _internals } from '../recordableRoutes';

// Resolved from the vitest root rather than import.meta.url: under this config
// import.meta.url is not a file: URL, so fileURLToPath throws at import time and
// the whole suite reports "0 test" — green-adjacent, and exactly the shape of
// failure this file exists to prevent.
const APP_JSX = resolve(process.cwd(), 'src/App.jsx');

/**
 * Declared route paths, read from the router.
 *
 * Line comments are stripped first. Asserting on raw source text is how two
 * pins on 2026-09-03 ended up matching the very comment that recorded a removed
 * value — a file that changes something is the same file that now documents it.
 * Here a commented-out `<Route path="/gone">` would otherwise read as declared.
 */
function declaredRoutes() {
  const src = readFileSync(APP_JSX, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

/** The same two forms canRecordOnRoute matches on. */
function correspondsToARoute(entry, routes) {
  return routes.some((r) => r === entry || r.startsWith(entry + '/'));
}

describe('recordableRoutes lists correspond to src/App.jsx', () => {
  it('parses a plausible route table (guards against a vacuous pass)', () => {
    // If the regex or the path ever breaks, `declared` goes empty and every
    // assertion below would pass by matching nothing at all. Fail loudly here
    // instead — this is the difference between a green suite and a real one.
    expect(existsSync(APP_JSX), `router not found at ${APP_JSX}`).toBe(true);
    const declared = declaredRoutes();
    expect(declared.length).toBeGreaterThan(50);
    expect(declared).toContain('/');
    expect(declared).toContain('/settings');
  });

  it('every DENYLIST entry names a route that exists', () => {
    // The original defect, stated as an assertion: 16 of 16 denylist entries
    // matched no route, so the list forbade nothing. Mutation defence: put
    // `/pin`, `/seed` or `/settings/wipe` back and this goes red.
    const declared = declaredRoutes();
    for (const entry of _internals.DENYLIST) {
      expect(
        correspondsToARoute(entry, declared),
        `DENYLIST entry ${entry} matches no route in App.jsx — it forbids nothing`
      ).toBe(true);
    }
  });

  it('every ALLOWLIST entry names a route that exists', () => {
    // A phantom here is not dangerous the way a phantom deny is — it fails
    // closed. It is still a lie about what the feature can record, and it is
    // what tempts the next reader into "fixing" the allowlist by widening it.
    const declared = declaredRoutes();
    for (const entry of _internals.ALLOWLIST) {
      expect(
        correspondsToARoute(entry, declared),
        `ALLOWLIST entry ${entry} matches no route in App.jsx`
      ).toBe(true);
    }
  });

  it('the routes that reveal seed, coercion state or signing are all denied', () => {
    // Correspondence is necessary but not sufficient: every entry could be real
    // and the dangerous routes still be absent from the list. This names them
    // explicitly, so deleting a denylist line goes red rather than silently
    // making that route recordable once the allowlist is widened.
    const mustBeDenied = [
      '/wallet-seed-qr',
      '/verify',
      '/personal-backup',
      '/onboarding/restore-shares',
      '/hd-wallet',
      '/duress-pin',
      '/stealth-wallets',
      '/panic-wipe',
      '/wallet-access',
      '/send',
      '/crypto-signing',
      '/walletconnect',
      '/connect',
    ];
    const declared = declaredRoutes();
    for (const path of mustBeDenied) {
      expect(declared, `${path} should still be a declared route`).toContain(path);
      expect(
        _internals.DENYLIST.some((p) => path === p || path.startsWith(p + '/')),
        `${path} must be on the DENYLIST`
      ).toBe(true);
    }
  });

  it('no ALLOWLIST entry is a prefix that swallows a denied route', () => {
    // `/` is exact-match-only in matchesPrefix ('/x'.startsWith('//') is false),
    // so it cannot swallow the app — but an entry like `/wallet` would swallow
    // `/wallet-seed-qr`'s siblings. Deny still wins at runtime; this catches the
    // shape at review time, where it is cheaper to reason about.
    for (const allowed of _internals.ALLOWLIST) {
      for (const denied of _internals.DENYLIST) {
        expect(
          _internals.matchesPrefix(denied, allowed),
          `ALLOWLIST ${allowed} covers DENYLIST ${denied} — deny still wins, but say so on purpose`
        ).toBe(false);
      }
    }
  });
});
