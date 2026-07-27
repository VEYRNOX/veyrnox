import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// I3 guard on the SHARED veyrnox-telemetry-consent key. A decoy/duress/stealth or
// demo session may read it, but must never write it: the primary wallet reads
// whatever any session wrote, so a coerced tap must not turn the real user's
// telemetry on, off, or wipe their answer and leave them facing an unexplained
// re-prompt on their own next entry.
//
// The guard is asserted HERE, at the writer chokepoint in lib/consent.js, rather
// than at each call site. There are three writers today — TelemetryConsent.choose,
// the Settings Privacy switch, and WalletEntry's fresh-create reset — and one of
// them originally shipped without the check. A rule enforced in three places is a
// rule that gets missed in a fourth.

const deniabilityActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniabilityActive(),
}));

const KEY = 'veyrnox-telemetry-consent';

let consent;
beforeEach(async () => {
  localStorage.clear();
  deniabilityActive.mockReturnValue(false);
  vi.resetModules();
  consent = await import('../consent');
});

afterEach(() => localStorage.clear());

describe('consent writes — real session', () => {
  it('stores a grant', () => {
    consent.setConsent(true);
    expect(localStorage.getItem(KEY)).toBe('granted');
    expect(consent.hasConsent()).toBe(true);
  });

  it('stores a denial', () => {
    consent.setConsent(false);
    expect(localStorage.getItem(KEY)).toBe('denied');
    expect(consent.hasConsent()).toBe(false);
  });

  it('clears a stored decision', () => {
    localStorage.setItem(KEY, 'granted');
    consent.clearConsent();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('consent writes — decoy/demo session leaves ZERO trace (I3)', () => {
  beforeEach(() => deniabilityActive.mockReturnValue(true));

  it('setConsent(true) writes nothing on a never-answered device', () => {
    consent.setConsent(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('setConsent does not overwrite a stored "denied" — the coercion case', () => {
    localStorage.setItem(KEY, 'denied');
    consent.setConsent(true);
    expect(localStorage.getItem(KEY)).toBe('denied');
  });

  it('setConsent does not overwrite a stored "granted"', () => {
    localStorage.setItem(KEY, 'granted');
    consent.setConsent(false);
    expect(localStorage.getItem(KEY)).toBe('granted');
  });

  it('clearConsent does not wipe the real answer', () => {
    localStorage.setItem(KEY, 'granted');
    consent.clearConsent();
    expect(localStorage.getItem(KEY)).toBe('granted');
  });

  it('reads still work — reading leaves no trace, and egress is gated elsewhere', () => {
    localStorage.setItem(KEY, 'granted');
    expect(consent.getConsentState()).toBe('granted');
  });
});

describe('consent — fail closed (I4)', () => {
  it('treats an unreadable store as "never answered", not as consent', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(consent.getConsentState()).toBeNull();
    expect(consent.hasConsent()).toBe(false);
    spy.mockRestore();
  });

  it('a throwing deniability check suppresses the write rather than allowing it', () => {
    // isDeniabilityOrDemoActive already fails closed internally, but if it ever
    // throws outright the write must not proceed.
    deniabilityActive.mockImplementation(() => { throw new Error('boom'); });
    localStorage.setItem(KEY, 'denied');
    expect(() => consent.setConsent(true)).toThrow();
    expect(localStorage.getItem(KEY)).toBe('denied');
  });
});
