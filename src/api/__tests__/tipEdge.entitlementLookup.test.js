// src/api/__tests__/tipEdge.entitlementLookup.test.js
//
// tip-chat's entitlement gate must query RevenueCat API v2, not v1.
//
// The v1 version of this lookup could never return true, for two independent
// reasons measured on 2026-09-20 against a live subscriber holding
// ai_security_protection (VEYRNOX/veyrnox#2662):
//
//   - the secret we hold is a v2-generation `sk_` key, and v1 answers
//     `403 code 7723 "secret API key incompatible with RevenueCat API V1"`;
//   - it read `subscriber.entitlements.active`, which does not exist on the v1
//     REST subscriber (that shape belongs to the SDK's CustomerInfo).
//
// Both deny silently, so the gate looked healthy while rejecting every paying
// subscriber. These assertions are structural, like tipEdge.chatRoute.test.js:
// the function is Deno source that vitest cannot execute.
//
// Comment lines are stripped before matching ON PURPOSE. The fix documents the
// v1 shape it replaced, so an unscoped "v1 is absent" assertion would match the
// explanation and fail on correct code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'supabase/functions/tip-chat/index.ts'),
  'utf8',
);

const CODE = SOURCE.split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('tip-chat entitlement lookup', () => {
  it('calls the RevenueCat v2 active_entitlements endpoint', () => {
    expect(CODE).toContain('https://api.revenuecat.com/v2');
    expect(CODE).toContain('/active_entitlements');
  });

  it('does not call the v1 subscribers endpoint in executable code', () => {
    expect(CODE).not.toContain('api.revenuecat.com/v1');
  });

  it('does not read the SDK-only entitlements.active shape', () => {
    expect(CODE).not.toMatch(/entitlements\s*\)?\s*\.active\b/);
    expect(CODE).not.toContain(").active");
  });

  it('denies when the project id is unconfigured, rather than admitting', () => {
    // I4: the v2 lookup needs REVENUECAT_PROJECT_ID, which v1 did not. An
    // unset secret must fail closed — the `return false` guard is what makes a
    // half-configured environment reject instead of bypassing the gate.
    expect(CODE).toContain("Deno.env.get('REVENUECAT_PROJECT_ID')");
    expect(CODE).toMatch(/if \(!projectId\) return false;/);
  });

  it('rejects a 200 that is not an event stream', () => {
    // A Cloudflare Access / Turnstile interstitial answers 200 with an HTML
    // body, so `upstream.ok` is true and the old code streamed the login page
    // to the client as if it were tokens. Observed on staging 2026-09-20.
    expect(CODE).toContain("upstream.headers.get('Content-Type')");
    expect(CODE).toMatch(/includes\('text\/event-stream'\)/);
    // and it must fail CLOSED rather than pass the body through
    const guard = CODE.slice(CODE.indexOf('upstreamType'));
    expect(guard).toMatch(/return json\(\{ error: 'tip_upstream_error', ref \}, 502, origin\);/);
  });

  it('remembers only a 404, the one 4xx that is a fact about the customer', () => {
    // The two defects above both answered with a 4xx, and the cache wrote each
    // one down as "this subscriber is not entitled" — the wrong fact about the
    // wrong party, held for the negative TTL. A 429 is the live version of the
    // same mistake: RevenueCat throttling us for ten seconds becomes ten
    // seconds of every paying subscriber being unentitled.
    expect(CODE).toMatch(/resp\.status === 404\) rememberEntitlement\(appUserId, false\)/);
    expect(CODE).not.toMatch(/resp\.status >= 400 && resp\.status < 500/);
  });

  it('never caches a 2xx whose body it could not read', () => {
    // `resp.json().catch(() => null)` collapsed "RevenueCat says nothing" and
    // "we could not read the answer" into one null, which was then cached as a
    // denial. Measured on staging 2026-09-20: the gate denied a genuinely
    // entitled subscriber when requests arrived in a burst and admitted the
    // same subscriber when they were spaced.
    const lookup = CODE.slice(CODE.indexOf('active_entitlements'));
    expect(lookup).toMatch(/await resp\.text\(\)/);
    expect(lookup).not.toMatch(/await resp\.json\(\)/);
    // and the unreadable branch must return BEFORE the cache write
    const bail = lookup.indexOf('return false;');
    const write = lookup.indexOf('rememberEntitlement(appUserId, ok)');
    expect(bail).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(bail).toBeLessThan(write);
  });

  it('leaves a log line on the failure modes that are not a denial', () => {
    // This gate shipped with no observability whatsoever, which is why three
    // independent defects all rendered as the same silent 403 and none was
    // visible from outside. A denial for a reason that is not "this customer
    // is not entitled" now says so.
    expect(CODE).toMatch(/\[tip-chat\] entitlement lookup: unreadable/);
  });

  it('streams under the Content-Type it checked, not a re-applied default', () => {
    // `?? 'text/event-stream'` on the relay is what let a Cloudflare Access
    // page reach the client wearing a stream's clothes. The guard above it
    // already resolved the real value; use that.
    const relay = CODE.slice(CODE.indexOf('new Response(upstream.body'));
    expect(relay).toMatch(/'Content-Type': upstreamType,/);
    expect(relay).not.toMatch(/\?\? 'text\/event-stream'/);
  });

  // The verdict predicate, EXECUTED rather than pattern-matched.
  //
  // Everything else in this file is structural, and structural assertions
  // could not have caught either defect the file was created for: both denied
  // for the wrong reason, which is indistinguishable from denying correctly.
  // Only a POSITIVE case separates a gate that denies correctly from a gate
  // that denies everything. The fixtures are verbatim RevenueCat v2
  // active_entitlements items captured on 2026-09-20 from a live grant.
  describe('the active_entitlements predicate, lifted out and run', () => {
    const src = /items\.some\(\(i\) => \{\n[\s\S]*?\n    \}\);/.exec(CODE)?.[0];

    it('extracted the predicate from the Deno source', () => {
      expect(src).toBeTruthy();
    });

    const predicate = new Function(
      'items',
      'entitlementId',
      `return ${String(src).replace(/^items\./, 'items.').replace(/;$/, '')};`,
    );
    const ID = 'entl262ea1e9d4';
    const check = (item) => predicate([item], ID);

    it('grants a live subscriber — the case neither old path could reach', () => {
      expect(check({
        object: 'customer.active_entitlement',
        entitlement_id: ID,
        expires_at: Date.now() + 3_600_000,
      })).toBe(true);
    });

    it('grants a lifetime entitlement, which carries a null expiry', () => {
      expect(check({ entitlement_id: ID, expires_at: null })).toBe(true);
      expect(check({ entitlement_id: ID })).toBe(true);
    });

    it('denies a different entitlement — Safety Plus must not unlock Vigil', () => {
      // The project defines two entitlements. A Safety Plus subscriber is a
      // paying customer who has not bought this tier.
      expect(check({ entitlement_id: 'entlf563332478', expires_at: Date.now() + 3_600_000 }))
        .toBe(false);
      // and the lookup_key is not the id, so it must not match either
      expect(check({ entitlement_id: 'ai_security_protection', expires_at: Date.now() + 1000 }))
        .toBe(false);
    });

    it('denies an entitlement that lapsed between RevenueCat and us', () => {
      expect(check({ entitlement_id: ID, expires_at: Date.now() - 1000 })).toBe(false);
    });

    it('fails closed on a non-numeric expiry and on junk items', () => {
      // v1 served ISO strings here; v2 serves epoch ms. A string must never be
      // coerced into a verdict.
      expect(check({ entitlement_id: ID, expires_at: '2099-01-01T00:00:00Z' })).toBe(false);
      for (const v of [null, undefined, 0, '', 'x', []]) expect(check(v)).toBe(false);
      expect(predicate([], ID)).toBe(false);
    });
  });

  it('resolves the entitlement id from its lookup_key', () => {
    // Pinning the opaque `entl...` id in config would drift silently against
    // the identifier the store and paywall use.
    expect(CODE).toContain('lookup_key');
    expect(CODE).toContain('REQUIRED_ENTITLEMENT');
  });
});
