// src/risk/__tests__/phishingFeed.test.js
//
// The feed is downloaded from a host we do not control, and its `reason` text
// is rendered inside the WalletConnect approval warning. These guards cover the
// two ways that goes wrong:
//
//   - untrusted entries reaching the UI unvalidated;
//   - the feed being able to WEAKEN screening (empty payload, over-broad suffix
//     match, or replacing the in-bundle seed).
//
// Also covers the injection wiring: knownBadDapps must keep working with no
// feed registered at all, which is the state on a device that never fetched.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

import { sanitizeEntry } from '../phishingFeed.js';
import { checkDappDomain, setFeedLookup, LOCAL_KNOWN_BAD } from '../knownBadDapps.js';

beforeEach(() => {
  setFeedLookup(null);
});

describe('sanitizeEntry — untrusted feed content', () => {
  it('drops entries with no usable domain', () => {
    expect(sanitizeEntry(null)).toBeNull();
    expect(sanitizeEntry('evil.com')).toBeNull();       // not an object
    expect(sanitizeEntry({ reason: 'x' })).toBeNull();  // no domain
    expect(sanitizeEntry({ domain: 42 })).toBeNull();
    expect(sanitizeEntry({ domain: '' })).toBeNull();
  });

  it('rejects a bare label — it would suffix-match a huge slice of the web', () => {
    // The parent-domain walk means a listed "com" would flag every .com site.
    expect(sanitizeEntry({ domain: 'com' })).toBeNull();
    expect(sanitizeEntry({ domain: 'app' })).toBeNull();
  });

  it('normalizes the domain the same way lookups do', () => {
    expect(sanitizeEntry({ domain: 'HTTPS://WWW.Evil.COM/path?x=1' })?.[0]).toBe('evil.com');
  });

  it('substitutes house copy when reason is missing or unusable', () => {
    const fallback = 'Listed on the phishing-domain feed';
    expect(sanitizeEntry({ domain: 'evil.com' })?.[1]).toBe(fallback);
    expect(sanitizeEntry({ domain: 'evil.com', reason: 42 })?.[1]).toBe(fallback);
    expect(sanitizeEntry({ domain: 'evil.com', reason: '   ' })?.[1]).toBe(fallback);
  });

  it('strips control characters so a feed cannot inject line breaks into a dialog', () => {
    const [, reason] = sanitizeEntry({ domain: 'evil.com', reason: 'bad\n\r site\u001B[31m' });
    expect(reason).not.toMatch(/[\u0000-\u001F\u007F]/);
    // The ESC becomes a space rather than vanishing, so nothing is silently joined.
    expect(reason).toBe('bad site [31m');
  });

  it('caps reason length', () => {
    const [, reason] = sanitizeEntry({ domain: 'evil.com', reason: 'x'.repeat(500) });
    expect(reason.length).toBe(120);
  });

  it('carries no field other than domain and reason', () => {
    const pair = sanitizeEntry({ domain: 'evil.com', reason: 'bad', severity: 'critical', html: '<img>' });
    expect(pair).toEqual(['evil.com', 'bad']);
  });
});

describe('checkDappDomain — feed layered over the seed', () => {
  const seeded = LOCAL_KNOWN_BAD[0].domain;

  it('works with NO feed registered — the state on a device that never fetched', () => {
    expect(checkDappDomain(`https://${seeded}`).flagged).toBe(true);
    expect(checkDappDomain('https://example.com').flagged).toBe(false);
  });

  it('a registered feed adds coverage', () => {
    setFeedLookup((d) => (d === 'feed-only-bad.test' ? 'On the feed' : null));
    const r = checkDappDomain('https://feed-only-bad.test/claim');
    expect(r.flagged).toBe(true);
    expect(r.reason).toBe('On the feed');
    expect(r.source).toBe('feed');
  });

  it('a feed match applies to subdomains too', () => {
    setFeedLookup((d) => (d === 'feed-only-bad.test' ? 'On the feed' : null));
    expect(checkDappDomain('https://app.deep.feed-only-bad.test').flagged).toBe(true);
  });

  it('the feed can never UNFLAG a seeded domain', () => {
    // A compromised feed answering "clean" for everything must not disable the
    // in-bundle list — the seed is the floor, not an alternative.
    setFeedLookup(() => null);
    expect(checkDappDomain(`https://${seeded}`)).toMatchObject({ flagged: true, source: 'local' });
  });

  it('a throwing feed does not take the seed down with it', () => {
    setFeedLookup(() => { throw new Error('boom'); });
    expect(() => checkDappDomain(`https://${seeded}`)).not.toThrow();
    expect(checkDappDomain(`https://${seeded}`).flagged).toBe(true);
  });

  it('still never returns a "safe" verdict, and the shape is unchanged', () => {
    setFeedLookup((d) => (d === 'feed-only-bad.test' ? 'On the feed' : null));
    const r = checkDappDomain('https://totally-unknown-domain.test');
    expect(r).toEqual({ domain: 'totally-unknown-domain.test', flagged: false, reason: null, source: null });
  });
});
