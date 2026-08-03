// src/api/__tests__/tipScreen.schema.test.js
//
// Audit 2026-08-03 M-4 — an unvalidated TIP response read as "no threat".
//
// screenTransaction()'s try/catch only fail-closes on THROWN errors: network
// failure, non-2xx, an aborted timeout, or genuinely malformed JSON syntax. A
// response that parses fine but does not match the expected shape — `verdict`
// missing, renamed, or a value nobody recognises, whether from a backend
// regression, schema drift against the (currently staging-only) TIP deployment,
// or a compromised endpoint — flowed through as a SUCCESS. s9TipThreat only
// special-cased 'block'/'warn'/'error', so anything else fell to its final
// `return LEVEL.OK`.
//
// That contradicted the module's own header ("I4: fail closed on error... never
// a silent pass") for precisely the failure mode a real backend is most likely
// to produce.
//
// The fix validates the response against an allowlist and degrades anything
// unrecognised to the 'error' verdict, which the existing code already maps to
// CAUTION.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/tipClient.js', () => ({
  createTipClient: vi.fn(),
  verdictToRiskLevel: vi.fn((v) => (v === 'block' ? 'high' : v === 'warn' ? 'medium' : 'info')),
  signalsToRiskRows: vi.fn((s) => (s || []).map((x) => ({ level: 'high', title: x.signal_type }))),
}));

const TX = { chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' };

describe('screenTransaction — response schema validation (M-4)', () => {
  let screenTransaction;
  let createTipClient;

  async function withResponse(payload) {
    vi.resetModules();
    // H-4 (audit 2026-08-03): the client no longer holds VITE_TIP_API_KEY /
    // VITE_TIP_SIGNING_SECRET — those are Edge Function secrets, and setting
    // them here makes getClient() REFUSE (asserted in tipScreen.proxy.test.js),
    // which would return null and break every assertion below on null.verdict.
    // The client is configured with Supabase credentials plus VITE_TIP_BASE_URL
    // as the feature switch.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    const dm = await import('@/wallet-core/deniabilitySession.js');
    dm.isDeniabilityOrDemoActive.mockReturnValue(false);
    createTipClient = (await import('@/api/tipClient.js')).createTipClient;
    createTipClient.mockReturnValue({ screen: vi.fn(async () => payload) });
    screenTransaction = (await import('../tipScreen.js')).screenTransaction;
    return screenTransaction(TX);
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it('passes a well-formed allow verdict through unchanged', async () => {
    const r = await withResponse({ verdict: 'allow', risk_data: { threat_signals: [], sanctions_hit: false } });
    expect(r.verdict).toBe('allow');
    expect(r.sanctions).toBe(false);
  });

  it('passes a well-formed block verdict through unchanged', async () => {
    const r = await withResponse({ verdict: 'block', risk_data: { threat_signals: [{ signal_type: 'drainer' }], sanctions_hit: true } });
    expect(r.verdict).toBe('block');
    expect(r.sanctions).toBe(true);
  });

  // ---- the M-4 cases: valid JSON, wrong shape ----

  it('degrades a MISSING verdict to error (not a silent OK)', async () => {
    const r = await withResponse({ risk_data: { threat_signals: [] } });
    expect(r.verdict).toBe('error');
    expect(r.level).toBe('medium');
  });

  it('degrades an UNRECOGNISED verdict to error', async () => {
    const r = await withResponse({ verdict: 'probably_fine', risk_data: {} });
    expect(r.verdict).toBe('error');
  });

  it('degrades a non-string verdict to error', async () => {
    const r = await withResponse({ verdict: 42, risk_data: {} });
    expect(r.verdict).toBe('error');
  });

  it('degrades a non-object response to error', async () => {
    expect((await withResponse('ok')).verdict).toBe('error');
    expect((await withResponse(null)).verdict).toBe('error');
    expect((await withResponse([])).verdict).toBe('error');
  });

  it('does not trust a non-boolean sanctions_hit', async () => {
    // A truthy non-boolean must not silently become a sanctions HIT, and a
    // non-boolean must never be carried through as-is.
    const r = await withResponse({ verdict: 'allow', risk_data: { sanctions_hit: 'yes', threat_signals: [] } });
    expect(typeof r.sanctions).toBe('boolean');
  });

  it('does not trust a non-array threat_signals', async () => {
    const r = await withResponse({ verdict: 'warn', risk_data: { threat_signals: 'lots' } });
    expect(Array.isArray(r.signals)).toBe(true);
    expect(Array.isArray(r.risks)).toBe(true);
  });

  it('a thrown client error still fails closed to CAUTION (unchanged behaviour)', async () => {
    vi.resetModules();
    // H-4 (audit 2026-08-03): the client no longer holds VITE_TIP_API_KEY /
    // VITE_TIP_SIGNING_SECRET — those are Edge Function secrets, and setting
    // them here makes getClient() REFUSE (asserted in tipScreen.proxy.test.js),
    // which would return null and break every assertion below on null.verdict.
    // The client is configured with Supabase credentials plus VITE_TIP_BASE_URL
    // as the feature switch.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    const dm = await import('@/wallet-core/deniabilitySession.js');
    dm.isDeniabilityOrDemoActive.mockReturnValue(false);
    const cc = (await import('@/api/tipClient.js')).createTipClient;
    cc.mockReturnValue({ screen: vi.fn(async () => { throw new Error('network'); }) });
    const fn = (await import('../tipScreen.js')).screenTransaction;
    const r = await fn(TX);
    expect(r.verdict).toBe('error');
    expect(r.level).toBe('medium');
  });
});
