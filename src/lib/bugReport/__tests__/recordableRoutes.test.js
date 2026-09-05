import { describe, it, expect } from 'vitest';
import { canRecordOnRoute, _internals } from '../recordableRoutes';

// See docs/bug-report-recording-plan.md — every test below is
// mutation-checked: reintroduce the defect it names and it goes red.
//
// Foundation gate for opt-in bug-report screen recording. Consumers do not
// exist yet (Slice 1a); tests pin the contract so Slice 1b + Slice 2 have
// something stable to build on.

describe('canRecordOnRoute — fail-closed defaults (I4)', () => {
  it('denies missing / non-string paths', () => {
    // Every failure mode of the caller (undefined route, null, wrong type)
    // must land at DENY — otherwise a bug elsewhere silently ENABLES capture.
    expect(canRecordOnRoute(undefined)).toBe(false);
    expect(canRecordOnRoute(null)).toBe(false);
    expect(canRecordOnRoute('')).toBe(false);
    expect(canRecordOnRoute(42)).toBe(false);
    expect(canRecordOnRoute({})).toBe(false);
  });

  it('denies an unknown path (not on either list)', () => {
    // A route no one has classified defaults to DENY. The mutation defence:
    // if canRecordOnRoute ever returns true here, someone flipped default to
    // ALLOW and every future route ships recordable-until-noticed.
    expect(canRecordOnRoute('/unclassified')).toBe(false);
    expect(canRecordOnRoute('/some/deep/path/no/one/added')).toBe(false);
  });
});

describe('canRecordOnRoute — allowlist', () => {
  it('allows exact-match allowlist entries', () => {
    expect(canRecordOnRoute('/')).toBe(true);
    expect(canRecordOnRoute('/receive')).toBe(true);
    expect(canRecordOnRoute('/settings')).toBe(true);
    expect(canRecordOnRoute('/plans')).toBe(true);
    expect(canRecordOnRoute('/docs')).toBe(true);
  });

  it('allows subroutes under an allowlist prefix', () => {
    // No `/settings` subroute exists in App.jsx today; these pin the prefix
    // BEHAVIOUR so a future real subpage inherits predictably rather than
    // surprising whoever adds it.
    expect(canRecordOnRoute('/settings/privacy')).toBe(true);
    expect(canRecordOnRoute('/settings/network/rpc-endpoints')).toBe(true);
  });

  it('`/` is exact-match only and does not swallow the whole app', () => {
    // The one entry where the segment-boundary rule earns its keep: matchesPrefix
    // tests '/receive'.startsWith('//'), which is false. Drop the boundary guard
    // and `/` would allow every route in the app, denylist entries included.
    expect(canRecordOnRoute('/')).toBe(true);
    expect(canRecordOnRoute('/unclassified')).toBe(false);
    expect(canRecordOnRoute('/tax')).toBe(false);
    expect(canRecordOnRoute('/duress-pin')).toBe(false);
  });
});

describe('canRecordOnRoute — segment-boundary matching (no substring leaks)', () => {
  it('does NOT allow a path that starts with an allowlist entry as a substring', () => {
    // The specific concrete failure: `/settings` allowed but
    // `/settingsomething` accidentally allowed too — user opens a debug route
    // called /settingsxray that shows keys, and it becomes recordable.
    expect(canRecordOnRoute('/settingsomething')).toBe(false);
    expect(canRecordOnRoute('/plansomething')).toBe(false);
    // Real neighbour, not a hypothetical: `/docs` must not reach `/dashboard-widgets`
    // and `/receive` must not reach a future `/receive-history`.
    expect(canRecordOnRoute('/docsearch')).toBe(false);
    expect(canRecordOnRoute('/receive-history')).toBe(false);
  });

  it('respects `/` as the only valid segment boundary', () => {
    // Mutation defence: if matchesPrefix loses the +'/' guard, this row goes
    // green and the row above goes red.
    expect(_internals.matchesPrefix('/settings', '/settings')).toBe(true);
    expect(_internals.matchesPrefix('/settings/', '/settings')).toBe(true);
    expect(_internals.matchesPrefix('/settings/x', '/settings')).toBe(true);
    expect(_internals.matchesPrefix('/settingsx', '/settings')).toBe(false);
  });
});

describe('canRecordOnRoute — denies the real sensitive routes', () => {
  // Every path below is declared in src/App.jsx. The previous version of this
  // block asserted `/pin`, `/seed/reveal`, `/verify-seed`, `/backup/personal`,
  // `/recovery/shard`, `/wallet-entry`, `/panic/erase`, `/decoy/entry`,
  // `/duress/setup` and `/wc/session-request` — ten paths, none of them routes.
  // Every one passed, because an unknown path is denied by default. The block
  // proved the fail-closed default ten times over and proved nothing about the
  // denylist. routesMatchRouter.test.js now pins the correspondence directly.

  it('denies the seed and backup routes', () => {
    expect(canRecordOnRoute('/wallet-seed-qr')).toBe(false);
    expect(canRecordOnRoute('/verify')).toBe(false);
    expect(canRecordOnRoute('/personal-backup')).toBe(false);
    expect(canRecordOnRoute('/onboarding/restore-shares')).toBe(false);
    expect(canRecordOnRoute('/hd-wallet')).toBe(false);
  });

  it('denies the coercion-configuration routes', () => {
    // The deliberate segment-boundary rule is why these must be spelled in
    // full. `/duress` does NOT match `/duress-pin` — a prefix only matches at
    // `/` or end — so the old shorthand entries were inert.
    expect(canRecordOnRoute('/duress-pin')).toBe(false);
    expect(canRecordOnRoute('/stealth-wallets')).toBe(false);
    expect(canRecordOnRoute('/panic-wipe')).toBe(false);
    expect(canRecordOnRoute('/wallet-access')).toBe(false);
  });

  it('denies the whole /send route, because confirm and sign live inside it', () => {
    // SendCrypto.jsx is ONE route; the confirm and sign steps are component
    // state, not paths. There is no `/send/form` to allow and no `/send/sign`
    // to deny, so the route is denied whole. If SendCrypto is ever split into
    // real subroutes, this is the assertion to revisit — not the allowlist.
    expect(canRecordOnRoute('/send')).toBe(false);
    expect(canRecordOnRoute('/crypto-signing')).toBe(false);
    expect(canRecordOnRoute('/walletconnect')).toBe(false);
    expect(canRecordOnRoute('/connect')).toBe(false);
  });

  it('denies auth-posture and dev routes', () => {
    expect(canRecordOnRoute('/biometric-auth')).toBe(false);
    expect(canRecordOnRoute('/hardware-wallet')).toBe(false);
    expect(canRecordOnRoute('/dev/prf-spike')).toBe(false);
  });

  it('denylist wins over an allowlist prefix that covers it', () => {
    // Conflict resolution, not the fail-closed default — the two are only
    // distinguishable when a path matches BOTH lists. The real lists do not
    // overlap (routesMatchRouter.test.js asserts that), so the overlap is
    // constructed here against _internals.evaluate, which is the same function
    // canRecordOnRoute calls.
    //
    // The old suite covered this with `/settings/wipe`, which is not a route —
    // so the one case that proved deny-wins was asserting on a phantom.
    //
    // Mutation defence: swap the order of the two listMatches calls inside
    // evaluate() and the first expectation goes red.
    const allow = ['/settings'];
    const deny = ['/settings/keys'];
    expect(_internals.evaluate('/settings/keys', allow, deny)).toBe(false);
    expect(_internals.evaluate('/settings/keys/export', allow, deny)).toBe(false);
    expect(_internals.evaluate('/settings/privacy', allow, deny)).toBe(true);
    expect(_internals.evaluate('/settings', allow, deny)).toBe(true);
  });

  it('evaluate() is the function canRecordOnRoute delegates to', () => {
    // Keeps the test above honest: if canRecordOnRoute ever stops routing
    // through evaluate(), the deny-wins pin would be testing dead code.
    for (const p of ['/', '/receive', '/send', '/duress-pin', '/unclassified', '']) {
      expect(
        _internals.evaluate(p, _internals.ALLOWLIST, _internals.DENYLIST),
        `evaluate and canRecordOnRoute must agree on ${p || '(empty)'}`
      ).toBe(canRecordOnRoute(p));
    }
  });
});

describe('_internals surface', () => {
  it('freezes the exposed lists so a caller cannot mutate the gate at runtime', () => {
    expect(Object.isFrozen(_internals)).toBe(true);
    expect(Object.isFrozen(_internals.ALLOWLIST)).toBe(true);
    expect(Object.isFrozen(_internals.DENYLIST)).toBe(true);
  });
});
