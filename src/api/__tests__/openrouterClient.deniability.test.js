// I3 deniability chokepoint pin for the OpenRouter LLM primitive.
//
// invokeLLM() is a POST to openrouter.ai — a third-party host. If any caller
// (e.g. NewsSentimentPage's Refresh mutation, an auto-fetch, a future feature)
// fires during a decoy/hidden/demo session, we leak both wallet-usage timing
// AND the exact prompt content to a remote host. That is an I2/I3 violation.
//
// This pins the fail-closed CHOKEPOINT: invokeLLM MUST throw a coded
// I3_DENIABILITY_ACTIVE error as its FIRST action when
// isDeniabilityOrDemoActive() is true, and MUST NOT call fetch. UI-layer hides
// are suspenders; this primitive is the belt.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setDeniabilitySession,
} from '@/wallet-core/deniabilitySession.js';
import { invokeLLM } from '@/api/openrouterClient.js';

describe('openrouterClient invokeLLM — I3 chokepoint (fail-closed)', () => {
  beforeEach(() => {
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch {}
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch {}
    vi.restoreAllMocks();
  });

  it('throws I3_DENIABILITY_ACTIVE when a deniability session is active — and never calls fetch', async () => {
    setDeniabilitySession(true);
    await expect(invokeLLM({ prompt: 'analyze BTC' })).rejects.toThrow(/I3_DENIABILITY_ACTIVE/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws I3_DENIABILITY_ACTIVE when the persisted demo flag is set — and never calls fetch', async () => {
    localStorage.setItem('veyrnox-demo', '1');
    await expect(invokeLLM({ prompt: 'analyze BTC' })).rejects.toThrow(/I3_DENIABILITY_ACTIVE/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('carries a machine-readable .code = I3_DENIABILITY_ACTIVE (contract, not prose)', async () => {
    setDeniabilitySession(true);
    let caught;
    try { await invokeLLM({ prompt: 'x' }); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('I3_DENIABILITY_ACTIVE');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('with deniability OFF, does NOT throw the I3 error (proceeds past the chokepoint)', async () => {
    // In the test env VITE_OPENROUTER_API_KEY is unset, so the next line of
    // defence trips with "API key not configured". The critical invariant
    // this positive test pins is: the I3 guard does NOT fire when it should
    // not — i.e. the guard is not a permanent block that would break the
    // real-session path in production.
    setDeniabilitySession(false);
    let caught;
    try { await invokeLLM({ prompt: 'x' }); } catch (e) { caught = e; }
    if (caught) {
      expect(caught.message || '').not.toMatch(/I3_DENIABILITY_ACTIVE/);
      expect(caught.code).not.toBe('I3_DENIABILITY_ACTIVE');
    }
  });
});
