// src/lib/__tests__/riskGateReady.test.js
//
// Audit 2026-08-03 H-1 / L-4 — the send-gate readiness predicate.
//
// H-1: `riskReady` was `DEMO || !!txSim.data || txSim.isError || !simEnabled`.
// It never looked at the TIP query at all, so a send could be judged (and
// approved) while remote threat screening was still in flight — and S9 returns
// OK for an absent tipResult, which means "not answered yet" was scored
// identically to "answered, clean". Nothing distinguished them.
//
// L-4: the same expression only ever consulted `txSim`, which is EVM-only. For a
// BTC/SOL send with the simulation toggle ON, `txSim` never runs, so `riskReady`
// could never become true and the send was blocked forever.
//
// Both come from one mistake: readiness was written in terms of ONE contributor
// instead of "every contributor that actually applies to this send". This helper
// states the rule once so the page cannot get it wrong again.
//
// The `data: null` case below is the one that matters most in practice:
// screenTransaction() legitimately resolves to null (deniability, or TIP simply
// not configured — which is every build today). A readiness check written as
// `!!query.data` would therefore never be satisfied, permanently blocking every
// send with screening enabled. Readiness must key off the query's SETTLED state,
// not its payload.

import { describe, it, expect } from 'vitest';
import { contributorSettled, isRiskGateReady } from '@/lib/riskGateReady.js';

const pending = { isSuccess: false, isError: false };
const ok = { isSuccess: true, isError: false, data: { verdict: 'allow' } };
const okNull = { isSuccess: true, isError: false, data: null };
const failed = { isSuccess: false, isError: true };

describe('contributorSettled', () => {
  it('a contributor that does not apply is settled regardless of its query', () => {
    expect(contributorSettled({ applies: false, query: pending })).toBe(true);
    expect(contributorSettled({ applies: false, query: undefined })).toBe(true);
  });

  it('an applicable contributor still in flight is NOT settled', () => {
    expect(contributorSettled({ applies: true, query: pending })).toBe(false);
  });

  it('an applicable contributor that succeeded is settled', () => {
    expect(contributorSettled({ applies: true, query: ok })).toBe(true);
  });

  it('settles on a successful result whose payload is null', () => {
    // The unconfigured/deniability case. `!!query.data` would report this as
    // never-ready and block every send.
    expect(contributorSettled({ applies: true, query: okNull })).toBe(true);
  });

  it('an applicable contributor that errored is settled', () => {
    // Errors are handled downstream (the TIP error path scores CAUTION); the
    // gate must not hang waiting for a query that will never succeed.
    expect(contributorSettled({ applies: true, query: failed })).toBe(true);
  });

  it('fails closed when an applicable contributor has no query state at all', () => {
    expect(contributorSettled({ applies: true, query: undefined })).toBe(false);
    expect(contributorSettled({ applies: true, query: null })).toBe(false);
  });

  it('fails closed on a malformed contributor', () => {
    expect(contributorSettled(null)).toBe(false);
    expect(contributorSettled(undefined)).toBe(false);
    expect(contributorSettled('nope')).toBe(false);
  });
});

describe('isRiskGateReady', () => {
  it('is ready when nothing applies', () => {
    expect(isRiskGateReady({ contributors: [] })).toBe(true);
    expect(isRiskGateReady({})).toBe(true);
  });

  it('waits for EVERY applicable contributor, not just the first', () => {
    // The H-1 shape: local simulation settles fast, remote screening does not.
    expect(isRiskGateReady({
      contributors: [
        { applies: true, query: ok },       // txSim done
        { applies: true, query: pending },  // TIP still in flight
      ],
    })).toBe(false);
  });

  it('is ready once every applicable contributor has settled', () => {
    expect(isRiskGateReady({
      contributors: [
        { applies: true, query: ok },
        { applies: true, query: failed },
      ],
    })).toBe(true);
  });

  it('is ready for a BTC/SOL send where the EVM simulation does not apply (L-4)', () => {
    // txSim is EVM-only. Before the fix its permanent non-readiness blocked the
    // send forever whenever the simulation toggle was on.
    expect(isRiskGateReady({
      contributors: [
        { applies: false, query: pending }, // txSim — never runs for BTC/SOL
        { applies: true, query: ok },       // TIP — the sole contributor here
      ],
    })).toBe(true);
  });

  it('still blocks a BTC/SOL send while its ONLY contributor is in flight', () => {
    expect(isRiskGateReady({
      contributors: [
        { applies: false, query: pending },
        { applies: true, query: pending },
      ],
    })).toBe(false);
  });

  it('demo short-circuits to ready', () => {
    expect(isRiskGateReady({ demo: true, contributors: [{ applies: true, query: pending }] })).toBe(true);
  });

  it('fails closed on a malformed contributor list', () => {
    expect(isRiskGateReady({ contributors: 'nope' })).toBe(false);
    expect(isRiskGateReady({ contributors: [null] })).toBe(false);
  });
});
