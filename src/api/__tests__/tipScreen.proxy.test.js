// src/api/__tests__/tipScreen.proxy.test.js
//
// Audit 2026-08-03 H-4 — the TIP signing secret must never reach the client.
//
// tipClient used to derive the per-key HMAC secret in the browser from
// import.meta.env.VITE_TIP_SIGNING_SECRET. Vite statically inlines every
// VITE_-prefixed variable into the shipped bundle (web and Capacitor alike), and
// vite.config.js's identifier-renaming obfuscation does not hide string
// literals — so that secret would have gone out to every user. An HMAC scheme
// whose verifying secret is handed to the caller authenticates nothing.
//
// Signing now happens in supabase/functions/tip-screen. These tests pin the two
// properties that matter:
//   1. the client cannot be constructed with a signing secret at all;
//   2. if someone sets the forbidden env vars again, screening DISABLES rather
//      than silently running with a bundled secret.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

const here = dirname(fileURLToPath(import.meta.url));

// Assertions about what the code does NOT contain must ignore comments — these
// files legitimately DESCRIBE the removed signing secret and Math.random in
// prose, and a raw scan would flag the explanation of the fix as the defect.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const clientSrc = stripComments(readFileSync(join(here, '../tipClient.js'), 'utf8'));
const screenSrc = readFileSync(join(here, '../tipScreen.js'), 'utf8');

const TX = { chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' };

describe('H-4 — no signing secret in the client', () => {
  it('tipClient does no HMAC signing at all', () => {
    expect(clientSrc).not.toMatch(/crypto\.subtle\.sign/);
    expect(clientSrc).not.toMatch(/importKey/);
    expect(clientSrc).not.toMatch(/X-Signature/);
  });

  it('tipClient never mentions a signing secret', () => {
    expect(clientSrc).not.toMatch(/signingSecret/);
    expect(clientSrc).not.toMatch(/VITE_TIP_SIGNING_SECRET/);
  });

  it('tipClient sends the TIP api key nowhere', () => {
    expect(clientSrc).not.toMatch(/X-Api-Key/);
  });

  it('createTipClient requires a proxy URL, not a TIP base URL and secret', async () => {
    const { createTipClient } = await import('@/api/tipClient.js');
    expect(() => createTipClient({ proxyUrl: '', anonKey: 'k' })).toThrow();
    expect(() => createTipClient({ proxyUrl: 'https://p', anonKey: '' })).toThrow();
    expect(() => createTipClient({ proxyUrl: 'https://p', anonKey: 'k' })).not.toThrow();
  });

  it('no longer uses Math.random for the request id', () => {
    // The project forbids Math.random for anything security-relevant; the id is
    // now generated server-side from a CSPRNG.
    expect(clientSrc).not.toMatch(/Math\.random/);
  });

  it('the request routes through the Edge Function path', () => {
    expect(screenSrc).toMatch(/functions\/v1\/tip-screen/);
  });
});

describe('H-4 — setting the forbidden env vars disables screening rather than using them', () => {
  let screenTransaction;

  async function load(env) {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const dm = await import('@/wallet-core/deniabilitySession.js');
    dm.isDeniabilityOrDemoActive.mockReturnValue(false);
    screenTransaction = (await import('../tipScreen.js')).screenTransaction;
  }

  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns null when VITE_TIP_SIGNING_SECRET is set (refuses to use it)', async () => {
    await load({
      VITE_SUPABASE_URL: 'https://sb.test',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_TIP_BASE_URL: 'https://tip.test',
      VITE_TIP_SIGNING_SECRET: 'leaked-secret',
    });
    expect(await screenTransaction(TX)).toBeNull();
  });

  it('returns null when VITE_TIP_API_KEY is set', async () => {
    await load({
      VITE_SUPABASE_URL: 'https://sb.test',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_TIP_BASE_URL: 'https://tip.test',
      VITE_TIP_API_KEY: 'leaked-key',
    });
    expect(await screenTransaction(TX)).toBeNull();
  });

  it('returns null when Supabase is not configured', async () => {
    await load({ VITE_TIP_BASE_URL: 'https://tip.test' });
    expect(await screenTransaction(TX)).toBeNull();
  });

  it('returns null when TIP is not switched on', async () => {
    await load({ VITE_SUPABASE_URL: 'https://sb.test', VITE_SUPABASE_ANON_KEY: 'anon' });
    expect(await screenTransaction(TX)).toBeNull();
  });
});

describe('H-4 — the Edge Function keeps the secrets server-side', () => {
  const fnRaw = readFileSync(
    join(here, '../../../supabase/functions/tip-screen/index.ts'), 'utf8',
  );
  const fnSrc = stripComments(fnRaw);

  it('reads the TIP credentials from Deno env, never from VITE_', () => {
    expect(fnSrc).toMatch(/Deno\.env\.get\('TIP_API_KEY'\)/);
    expect(fnSrc).toMatch(/Deno\.env\.get\('TIP_SIGNING_SECRET'\)/);
    expect(fnSrc).not.toMatch(/VITE_TIP/);
  });

  it('does the signing itself', () => {
    expect(fnSrc).toMatch(/X-Signature/);
    expect(fnSrc).toMatch(/hmacHex/);
  });

  it('fails closed when it is not configured (503, not a clean verdict)', () => {
    expect(fnSrc).toMatch(/tip_not_configured/);
    expect(fnSrc).toMatch(/503/);
  });

  it('rebuilds the upstream body from an allowlist rather than forwarding input', () => {
    // The proxy must not be usable to smuggle arbitrary payloads to TIP under
    // our credentials.
    expect(fnSrc).toMatch(/STRING_FIELDS/);
    expect(fnSrc).toMatch(/buildUpstreamBody/);
  });

  it('does not relay the upstream error body to the client', () => {
    expect(fnSrc).toMatch(/tip_upstream_error/);
  });

  it('generates the request id with a CSPRNG', () => {
    expect(fnSrc).toMatch(/crypto\.randomUUID\(\)/);
    expect(fnSrc).not.toMatch(/Math\.random/);
  });

  it('L-9 — no plaintext-http origin is compiled into the CORS allowlist', () => {
    // The 2026-07-28 internal audit removed `http://localhost` from
    // first-referral-bonus (finding L-9); it reappeared here on 2026-08-06
    // alongside the chat-routing change, with nothing to catch it. This
    // allowlist is the function's ONLY origin-level control — the anon-key
    // check is possession of a public key, not authentication — so a
    // compiled-in http:// origin is reachable from every deployment including
    // production.
    //
    // Reads the COMMENT-STRIPPED source on purpose: the comment above the
    // allowlist names the string it is banning, so asserting over the raw file
    // would fail on the explanation itself.
    //
    // Local development grants it per-deployment through the ALLOWED_ORIGINS
    // env var instead, which this function already merges in — so widening the
    // compiled defaults is never the fix if this goes red.
    const list = fnSrc.match(/DEFAULT_ALLOWED_ORIGINS\s*=\s*\[([\s\S]*?)\]/)?.[1];
    expect(list).toBeTruthy();
    expect(list).not.toMatch(/['"]http:\/\//);
    // Guard the guard: the regex must actually be looking at the origin list.
    expect(list).toMatch(/https:\/\/veyrnox\.com/);
    expect(fnSrc).toMatch(/ALLOWED_ORIGINS/);
  });

  it('documents that it is NOT deployed with --no-verify-jwt', () => {
    // This one deliberately reads the RAW file: it is a claim about the deploy
    // instructions, which live in the header comment.
    expect(fnRaw).toMatch(/NOTE the missing --no-verify-jwt/);
    expect(fnRaw).not.toMatch(/functions deploy tip-screen --no-verify-jwt/);
  });
});
