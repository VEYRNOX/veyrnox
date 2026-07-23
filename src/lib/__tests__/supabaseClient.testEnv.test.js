// @ts-nocheck
// Guards the test environment against LIVE writes to the production Supabase.
//
// What happened (2026-07-23): `.env.local` carries real VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY, and Vitest loads .env.local. `supabaseClient.js`
// hands back a real client whenever both are set. Dozens of tests render
// WalletProvider, which fires trackEvent(WALLET_CREATED) / SESSION_START, and
// only trackEvent's own test mocked the client — so an ordinary local test run
// inserted rows into the PRODUCTION `events` table. One run produced 126 events
// across 114 phantom device_ids (each jsdom test gets fresh localStorage, hence
// a new device id). That is analytics corruption plus unintended network egress
// from a test run (I2).
//
// The fix lives in vitest.config.js, which blanks both vars. This test pins it:
// it fails the moment the blanking is removed, rather than letting the next
// full-suite run quietly write to production again.
//
// CI was never affected — .env.local is git-ignored and absent there — which is
// precisely why this needed a test rather than trusting a green pipeline.

import { describe, it, expect } from 'vitest';
import { supabase } from '@/lib/supabaseClient';

describe('supabase client is inert under test', () => {
  it('has no credentials in the test environment', () => {
    // Asserted on the env directly, so this fails for ANY developer whose
    // .env.local leaks through — not just on a machine that happens to be
    // credential-free (where a null-client assertion would pass vacuously).
    expect(import.meta.env.VITE_SUPABASE_URL).toBeFalsy();
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBeFalsy();
  });

  it('exports null, so every caller takes its existing no-op guard', () => {
    // trackEvent, referralApi et al. all early-return on a null client. This is
    // the module's documented contract, not a test-only branch — nothing is
    // mocked to make it true.
    expect(supabase).toBeNull();
  });
});
