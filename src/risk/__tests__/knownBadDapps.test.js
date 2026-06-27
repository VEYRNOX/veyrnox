// src/risk/__tests__/knownBadDapps.test.js
//
// knownBadDapps — the single local source of truth for the known-bad dApp list
// and the pure check over it. LOCAL-ONLY, total (never throws), never "safe".

import { describe, it, expect } from 'vitest';
import { LOCAL_KNOWN_BAD, normalizeDomain, checkDappDomain } from '../knownBadDapps.js';

describe('normalizeDomain', () => {
  it('strips scheme, www, path and lowercases', () => {
    expect(normalizeDomain('HTTPS://www.FakeSwap-Rewards.xyz/claim?a=1')).toBe('fakeswap-rewards.xyz');
  });
  it('is total: non-string and empty inputs yield empty string', () => {
    expect(normalizeDomain(undefined)).toBe('');
    expect(normalizeDomain(null)).toBe('');
    expect(normalizeDomain(42)).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });
  it('strips query string and fragment on a bare domain', () => {
    expect(normalizeDomain('fakeswap-rewards.xyz?claim=1')).toBe('fakeswap-rewards.xyz');
    expect(normalizeDomain('app.uniswap.org#section')).toBe('app.uniswap.org');
  });
});

describe('checkDappDomain', () => {
  it('flags a known-bad domain with its reason (scheme/path tolerant)', () => {
    const r = checkDappDomain('https://fakeswap-rewards.xyz/airdrop');
    expect(r.flagged).toBe(true);
    expect(r.domain).toBe('fakeswap-rewards.xyz');
    expect(typeof r.reason).toBe('string');
    expect(checkDappDomain('fakeswap-rewards.xyz?ref=abc').flagged).toBe(true);
  });
  it('does NOT flag a domain absent from the local list, and returns no reason', () => {
    const r = checkDappDomain('https://app.uniswap.org');
    expect(r.flagged).toBe(false);
    expect(r.domain).toBe('app.uniswap.org');
    expect(r.reason).toBeNull();
  });
  it('is total: empty / non-string input is unflagged and never throws', () => {
    expect(() => checkDappDomain(undefined)).not.toThrow();
    expect(checkDappDomain(undefined)).toEqual({ domain: '', flagged: false, reason: null });
    expect(checkDappDomain('')).toEqual({ domain: '', flagged: false, reason: null });
  });
  it('L5: flags a subdomain of a known-bad parent domain (suffix walk)', () => {
    const r = checkDappDomain('https://app.fakeswap-rewards.xyz/claim');
    expect(r.flagged).toBe(true);
    expect(r.domain).toBe('app.fakeswap-rewards.xyz');
    expect(typeof r.reason).toBe('string');
    expect(checkDappDomain('evil.deep.fakeswap-rewards.xyz').flagged).toBe(true);
  });
  it('L5: does NOT over-match on a shared TLD only', () => {
    // shares the .xyz TLD with fakeswap-rewards.xyz but is not a subdomain of it
    expect(checkDappDomain('https://totally-legit.xyz').flagged).toBe(false);
  });
  it('every list entry is itself flagged (self-consistency)', () => {
    for (const b of LOCAL_KNOWN_BAD) {
      expect(checkDappDomain(b.domain).flagged).toBe(true);
    }
  });
});
