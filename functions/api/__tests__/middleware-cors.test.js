// functions/api/__tests__/middleware-cors.test.js
//
// The /api/* CORS allowlist is the only origin-level control in front of the
// edge routes — and those routes are not inert: /api/rpc/[fn] injects the
// Supabase anon key server-side and proxies referral + telemetry writes, and
// /api/buy/session mints a Transak widget URL.
//
// The allowance for Cloudflare preview deployments was originally written as
//
//   allowed.find(o => origin === o || origin.endsWith('.pages.dev'))
//
// where the second test ignores `o` entirely, so it is constant-true for any
// `.pages.dev` origin and `.find()` matches on the first element. Because
// *.pages.dev is a free self-service namespace, anyone could deploy
// `evil-attacker.pages.dev` and have it reflected straight back into
// Access-Control-Allow-Origin.
//
// These tests pin the preview allowance to THIS project's own deployments.

import { describe, it, expect } from 'vitest';
import { onRequest } from '../_middleware.js';

const CANONICAL = 'https://veyrnox.com';

/** Drive the middleware with an Origin and read back the ACAO it would send. */
async function acao(origin, { env = {}, method = 'GET' } = {}) {
  const request = new Request('https://veyrnox.com/api/data/prices', {
    method,
    headers: origin ? { Origin: origin } : {},
  });
  const res = await onRequest({
    request,
    env,
    next: async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
  });
  return res.headers.get('Access-Control-Allow-Origin');
}

describe('/api CORS — allowlisted origins are reflected', () => {
  it.each([
    'https://veyrnox.com',
    'https://www.veyrnox.com',
    'capacitor://localhost',
    'https://localhost',
    'http://localhost:5173',
  ])('reflects %s', async (origin) => {
    expect(await acao(origin)).toBe(origin);
  });

  it('reflects this project\'s own Pages preview deployments', async () => {
    expect(await acao('https://veyrnox-prod.pages.dev')).toBe('https://veyrnox-prod.pages.dev');
    expect(await acao('https://my-branch.veyrnox-prod.pages.dev'))
      .toBe('https://my-branch.veyrnox-prod.pages.dev');
    expect(await acao('https://veyrnox-staging.pages.dev')).toBe('https://veyrnox-staging.pages.dev');
  });

  it('honours extra origins from the ALLOWED_ORIGINS env var', async () => {
    const env = { ALLOWED_ORIGINS: 'http://localhost:5173, https://preview.example' };
    expect(await acao('http://localhost:5173', { env })).toBe('http://localhost:5173');
    expect(await acao('https://preview.example', { env })).toBe('https://preview.example');
  });
});

describe('/api CORS — everything else is refused, not reflected', () => {
  it.each([
    // The bug. Free, self-service namespace: anyone can hold one of these.
    ['https://evil-attacker.pages.dev', 'arbitrary pages.dev project'],
    ['https://totally-not-veyrnox.pages.dev', 'lookalike pages.dev project'],
    // Suffix games against the anchored pattern.
    ['https://veyrnox-prod.pages.dev.attacker.com', 'suffix-extended host'],
    ['https://notveyrnox-prod.pages.dev', 'prefix-glued project name'],
    ['https://evil.veyrnox-prod.pages.dev.evil.com', 'nested lookalike'],
    // Plain hostile origins.
    ['https://evil.com', 'unrelated origin'],
    ['http://veyrnox.com', 'plaintext downgrade of an allowed host'],
  ])('refuses %s (%s)', async (origin) => {
    const got = await acao(origin);
    expect(got).not.toBe(origin);
    // Omitting ACAO makes the browser reject the response without reflecting
    // any origin that the request did not earn through the allowlist.
    expect(got).toBeNull();
  });

  it('does not let a subdomain label smuggle a dot', async () => {
    // `[a-z0-9-]+` must not admit `.`, or the anchored pattern would still
    // match an attacker-controlled parent domain.
    expect(await acao('https://a.b.veyrnox-prod.pages.dev.evil.com')).toBeNull();
  });
});

describe('/api CORS — preflight', () => {
  it('answers OPTIONS with 204 and the same origin decision', async () => {
    const request = new Request('https://veyrnox.com/api/data/prices', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil-attacker.pages.dev' },
    });
    const res = await onRequest({ request, env: {}, next: async () => new Response('unused') });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('sets Vary: Origin so a cache cannot serve one origin\'s headers to another', async () => {
    const request = new Request('https://veyrnox.com/api/data/prices', {
      method: 'GET',
      headers: { Origin: CANONICAL },
    });
    const res = await onRequest({ request, env: {}, next: async () => new Response('{}') });
    expect(res.headers.get('Vary')).toBe('Origin');
  });
});
