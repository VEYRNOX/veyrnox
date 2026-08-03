// src/lib/__tests__/advisorConsent.test.js
//
// Audit 2026-08-03 M-5 — the Security Advisor was a SECOND, ungated egress path.
//
// Free-text the user types — which could be an address they are worried about,
// or a description of their situation — was POSTed to a third-party AI endpoint
// with no disclosure screen, no consent check, and no mention anywhere in the
// app's privacy copy. The project deliberately reduced telemetry to a single
// egress chokepoint (api/trackEvent.js) gated by a single consent chokepoint
// (lib/consent.js); this feature imported neither.
//
// The I3 gate WAS correct and tested (the whole component returns null in
// deniability/demo), so this was never a deniability leak. It was a consent and
// disclosure gap.
//
// Deliberately a SEPARATE decision from telemetry consent: "anonymous usage
// counters" and "my typed questions go to a third-party AI" are not the same
// bargain, and silently reusing the telemetry answer for both would be its own
// honesty problem. Declining is not a dead end — the advisor already has a local
// knowledge base and simply answers from it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

describe('advisorConsent', () => {
  let mod;
  let isDeniabilityOrDemoActive;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession')).isDeniabilityOrDemoActive;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    mod = await import('@/lib/advisorConsent.js');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('is opt-in: never-answered is NOT consent', () => {
    expect(mod.getAdvisorConsentState()).toBeNull();
    expect(mod.hasAdvisorConsent()).toBe(false);
  });

  it('records an explicit grant', () => {
    mod.setAdvisorConsent(true);
    expect(mod.getAdvisorConsentState()).toBe('granted');
    expect(mod.hasAdvisorConsent()).toBe(true);
  });

  it('records an explicit denial, which is distinct from never-answered', () => {
    mod.setAdvisorConsent(false);
    expect(mod.getAdvisorConsentState()).toBe('denied');
    expect(mod.hasAdvisorConsent()).toBe(false);
  });

  it('a denial is remembered, so the user is not re-asked every time', () => {
    mod.setAdvisorConsent(false);
    expect(mod.getAdvisorConsentState()).toBe('denied');
    // A second read must not reset it.
    expect(mod.getAdvisorConsentState()).toBe('denied');
  });

  it('clearing returns the device to never-answered', () => {
    mod.setAdvisorConsent(true);
    mod.clearAdvisorConsent();
    expect(mod.getAdvisorConsentState()).toBeNull();
  });

  // ---- I3: writes are the chokepoint (lib/consent.js pattern) ----

  it('does NOT write from a decoy/demo session', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.setAdvisorConsent(true);
    expect(localStorage.getItem(mod.ADVISOR_CONSENT_KEY)).toBeNull();
  });

  it('a decoy session cannot overwrite the real user\'s stored answer', () => {
    mod.setAdvisorConsent(false);            // real user declined
    isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.setAdvisorConsent(true);             // coerced tap under duress
    isDeniabilityOrDemoActive.mockReturnValue(false);
    expect(mod.getAdvisorConsentState()).toBe('denied');
  });

  it('a decoy session cannot WIPE the real user\'s stored answer', () => {
    mod.setAdvisorConsent(true);
    isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.clearAdvisorConsent();
    isDeniabilityOrDemoActive.mockReturnValue(false);
    expect(mod.getAdvisorConsentState()).toBe('granted');
  });

  it('reads stay ungated — reading leaves no trace', () => {
    mod.setAdvisorConsent(true);
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(() => mod.getAdvisorConsentState()).not.toThrow();
  });

  it('fails closed when localStorage is unreadable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('nope'); });
    expect(mod.getAdvisorConsentState()).toBeNull();
    expect(mod.hasAdvisorConsent()).toBe(false);
    spy.mockRestore();
  });

  it('a failed write does not throw', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => mod.setAdvisorConsent(true)).not.toThrow();
    spy.mockRestore();
  });
});

describe('advisorConsent — the key is swept by panic wipe', () => {
  it('ADVISOR_CONSENT_KEY is listed in the residue keys', async () => {
    // Standing rule from the 2026-07-28 residue finding: a new localStorage key
    // must join the wipe list, or its PRESENCE becomes a tell that survives a
    // panic wipe AND the wipe still reports clean.
    const { ADVISOR_CONSENT_KEY } = await import('@/lib/advisorConsent.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const panicSrc = readFileSync(join(here, '../../wallet-core/panic.js'), 'utf8');
    expect(panicSrc).toContain(ADVISOR_CONSENT_KEY);
  });
});
