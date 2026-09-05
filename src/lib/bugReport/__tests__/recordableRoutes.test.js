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
    expect(canRecordOnRoute('/dashboard')).toBe(true);
    expect(canRecordOnRoute('/receive')).toBe(true);
    expect(canRecordOnRoute('/plans')).toBe(true);
    expect(canRecordOnRoute('/help')).toBe(true);
    expect(canRecordOnRoute('/documentation')).toBe(true);
  });

  it('allows subroutes under an allowlist prefix', () => {
    expect(canRecordOnRoute('/settings/privacy')).toBe(true);
    expect(canRecordOnRoute('/settings/network/rpc-endpoints')).toBe(true);
    expect(canRecordOnRoute('/send/form')).toBe(true);
  });
});

describe('canRecordOnRoute — segment-boundary matching (no substring leaks)', () => {
  it('does NOT allow a path that starts with an allowlist entry as a substring', () => {
    // The specific concrete failure: `/settings` allowed but
    // `/settingsomething` accidentally allowed too — user opens a debug route
    // called /settingsxray that shows keys, and it becomes recordable.
    expect(canRecordOnRoute('/settingsomething')).toBe(false);
    expect(canRecordOnRoute('/dashboardbeta')).toBe(false);
    expect(canRecordOnRoute('/plansomething')).toBe(false);
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

describe('canRecordOnRoute — denylist wins on conflict (I4 belt-and-braces)', () => {
  it('denies denylist entries even though nothing on the allowlist matches', () => {
    // Sanity: pure denies work.
    expect(canRecordOnRoute('/pin')).toBe(false);
    expect(canRecordOnRoute('/seed/reveal')).toBe(false);
    expect(canRecordOnRoute('/verify-seed')).toBe(false);
    expect(canRecordOnRoute('/backup/personal')).toBe(false);
    expect(canRecordOnRoute('/recovery/shard')).toBe(false);
    expect(canRecordOnRoute('/wallet-entry')).toBe(false);
    expect(canRecordOnRoute('/panic/erase')).toBe(false);
    expect(canRecordOnRoute('/decoy/entry')).toBe(false);
    expect(canRecordOnRoute('/duress/setup')).toBe(false);
    expect(canRecordOnRoute('/wc/session-request')).toBe(false);
  });

  it('denies /send/confirm and /send/sign — different-prefix from /send/form', () => {
    // /send/form is allowed exactly; /send/confirm and /send/sign are neither
    // covered by that prefix nor by any other allowlist entry. They also sit
    // on the denylist as belt-and-braces. This documents both properties.
    expect(canRecordOnRoute('/send/form')).toBe(true);
    expect(canRecordOnRoute('/send/form/eth-sepolia')).toBe(true);
    expect(canRecordOnRoute('/send/confirm')).toBe(false);
    expect(canRecordOnRoute('/send/sign')).toBe(false);
    expect(canRecordOnRoute('/send/sign/wc-request-42')).toBe(false);
  });

  it('denies a route that IS covered by an allowlist prefix (proves deny-wins)', () => {
    // /settings/wipe is on the denylist AND covered by the /settings allowlist
    // prefix. This is the ONLY test that proves deny-wins under a conflict
    // (the /send/* tests above prove segment-boundary + missing-allow, not
    // conflict resolution). Mutation defence: swap the order of the two
    // listMatches calls in canRecordOnRoute and this row goes red.
    expect(canRecordOnRoute('/settings')).toBe(true);
    expect(canRecordOnRoute('/settings/privacy')).toBe(true);
    expect(canRecordOnRoute('/settings/wipe')).toBe(false);
    expect(canRecordOnRoute('/settings/wipe/confirm')).toBe(false);
  });
});

describe('_internals surface', () => {
  it('freezes the exposed lists so a caller cannot mutate the gate at runtime', () => {
    expect(Object.isFrozen(_internals)).toBe(true);
    expect(Object.isFrozen(_internals.ALLOWLIST)).toBe(true);
    expect(Object.isFrozen(_internals.DENYLIST)).toBe(true);
  });
});
