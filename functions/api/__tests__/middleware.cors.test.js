// functions/api/__tests__/middleware.cors.test.js
//
// Origin-allowlist tests for the shared /api/* middleware.
//
// WHY THIS FILE EXISTS: the allowlist match was written as
//
//   allowed.find(o => origin === o || origin.endsWith('.pages.dev'))
//
// where the second clause never references `o`. Once the iteration reached the
// first element it decided the whole predicate, so ANY origin ending in
// `.pages.dev` was reflected back in Access-Control-Allow-Origin — and
// `<project>.pages.dev` is handed to anyone who creates a Cloudflare Pages
// project, so that is an attacker-registrable namespace.
//
// Nothing in `functions/` was covered by a test when this shipped; the
// vitest glob that runs this directory at all only landed in 65e1cb45.
//
// WHAT THE ALLOWLIST IS ACTUALLY FOR — worth stating so nobody "simplifies" it
// away: these endpoints are unauthenticated by design and set no
// Access-Control-Allow-Credentials, so CORS is not an authentication boundary
// here and curl reaches them regardless. What it constrains is browser-driven
// abuse from a hostile page — which matters because it is how the per-IP rate
// limits (M-6/M-7/L-10) get sidestepped: requests sourced from arbitrary
// visitors' browsers arrive on arbitrary visitors' IPs.

import { describe, it, expect } from 'vitest';
import { onRequest } from '../_middleware.js';

const OK = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

function ctx(origin, env = {}) {
  return {
    request: new Request('https://veyrnox-prod.pages.dev/api/data/prices', {
      method: 'GET',
      headers: origin ? { Origin: origin } : {},
    }),
    env,
    next: async () => OK.clone(),
  };
}

async function allowOriginFor(origin, env) {
  const res = await onRequest(ctx(origin, env));
  return res.headers.get('Access-Control-Allow-Origin');
}

describe('CORS origin allowlist — reflects only permitted origins', () => {
  it.each([
    'https://veyrnox.com',
    'https://www.veyrnox.com',
    'capacitor://localhost',
    'https://localhost',
  ])('reflects the allowlisted origin %s', async (origin) => {
    expect(await allowOriginFor(origin)).toBe(origin);
  });

  it('reflects the production Pages origin', async () => {
    // veyrnox-prod.pages.dev is the LIVE deployment (wrangler.toml `name`,
    // deploy-preview.yml --project-name). It was absent from the allowlist and
    // worked only via the buggy wildcard, so fixing the predicate without
    // adding it here would have broken production.
    expect(await allowOriginFor('https://veyrnox-prod.pages.dev'))
      .toBe('https://veyrnox-prod.pages.dev');
  });

  it('reflects a branch preview subdomain of the production project', async () => {
    // Preview deploys are <branch-slug>.veyrnox-prod.pages.dev — almost
    // certainly why someone reached for `.endsWith('.pages.dev')` originally.
    expect(await allowOriginFor('https://fix-buy-flow.veyrnox-prod.pages.dev'))
      .toBe('https://fix-buy-flow.veyrnox-prod.pages.dev');
  });

  it('honours extra origins supplied via the ALLOWED_ORIGINS env var', async () => {
    expect(await allowOriginFor('https://preview.example.com', {
      ALLOWED_ORIGINS: 'https://preview.example.com',
    })).toBe('https://preview.example.com');
  });
});

describe('CORS origin allowlist — refuses everything else', () => {
  const FALLBACK = 'https://veyrnox.com';

  it('does NOT reflect an arbitrary attacker-registered pages.dev project', async () => {
    // The core defect. Anyone can create a Cloudflare Pages project.
    expect(await allowOriginFor('https://evil.pages.dev')).toBe(FALLBACK);
  });

  it('does NOT reflect a pages.dev subdomain of someone else\'s project', async () => {
    expect(await allowOriginFor('https://x.attacker-project.pages.dev')).toBe(FALLBACK);
  });

  it('does NOT reflect a lookalike that merely ENDS with the project host', async () => {
    // Guards the regex anchoring: `evil-veyrnox-prod.pages.dev` must not pass,
    // and neither must a domain that just embeds ours as a suffix.
    expect(await allowOriginFor('https://evilveyrnox-prod.pages.dev')).toBe(FALLBACK);
    expect(await allowOriginFor('https://veyrnox-prod.pages.dev.evil.com')).toBe(FALLBACK);
  });

  it('does NOT reflect a plaintext-HTTP version of an allowed origin', async () => {
    expect(await allowOriginFor('http://veyrnox.com')).toBe(FALLBACK);
    expect(await allowOriginFor('http://veyrnox-prod.pages.dev')).toBe(FALLBACK);
  });

  it('does NOT reflect an unrelated origin', async () => {
    expect(await allowOriginFor('https://evil.com')).toBe(FALLBACK);
  });

  it('falls back safely when no Origin header is present', async () => {
    expect(await allowOriginFor(undefined)).toBe(FALLBACK);
  });
});

describe('CORS behaviour is preserved elsewhere', () => {
  it('answers preflight with 204 and the CORS headers', async () => {
    const res = await onRequest({
      request: new Request('https://veyrnox-prod.pages.dev/api/data/prices', {
        method: 'OPTIONS',
        headers: { Origin: 'https://veyrnox.com' },
      }),
      env: {},
      next: async () => OK.clone(),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://veyrnox.com');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('wraps a non-exposed handler error in a generic envelope', async () => {
    const res = await onRequest({
      request: new Request('https://veyrnox-prod.pages.dev/api/data/prices', {
        headers: { Origin: 'https://veyrnox.com' },
      }),
      env: {},
      next: async () => { throw new Error('secret internal detail'); },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
  });

  it('still applies the allowlist on the error path', async () => {
    const res = await onRequest({
      request: new Request('https://veyrnox-prod.pages.dev/api/data/prices', {
        headers: { Origin: 'https://evil.pages.dev' },
      }),
      env: {},
      next: async () => { throw Object.assign(new Error('nope'), { status: 400, expose: true }); },
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://veyrnox.com');
  });
});
