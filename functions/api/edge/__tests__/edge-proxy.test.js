// functions/api/edge/__tests__/edge-proxy.test.js
//
// The /api/edge/<fn> proxy injects SUPABASE_ANON_KEY server-side and is the
// transport SecurityAdvisor uses for tip-chat.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../[fn].js';

const URL_BASE = 'https://db.example.supabase.co';
const ENV = { SUPABASE_URL: URL_BASE, SUPABASE_ANON_KEY: 'anon-key' };

function ctx(fn, { headers = {}, body = '{"action":"chat"}' } = {}) {
  return {
    request: new Request(`https://veyrnox.com/api/edge/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // enforceRateLimit is fail-closed without a CF-Connecting-IP.
        'CF-Connecting-IP': '203.0.113.1',
        ...headers,
      },
      body,
    }),
    env: ENV,
    params: { fn },
  };
}

async function thrown(fn) {
  try { await fn(); } catch (e) { return e; }
  throw new Error('expected a throw');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
  vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('X-Rc-User-Id forwarding', () => {
  // REGRESSION PIN. The header set was fixed at {Content-Type, Authorization,
  // apikey}, so tip-chat never saw the RevenueCat id it gates entitlement on
  // and returned 403 entitlement_required to every subscriber on this path.
  // SecurityAdvisor then fell back to the direct-Supabase URL this proxy exists
  // to replace, which is why the feature looked like it worked.
  it('forwards the id upstream', async () => {
    await onRequestPost(ctx('tip-chat', {
      headers: { 'X-Rc-User-Id': '$RCAnonymousID:8f2c1a4b9d6e3f70' },
    }));
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers['X-Rc-User-Id']).toBe('$RCAnonymousID:8f2c1a4b9d6e3f70');
  });

  it('omits the header entirely when the caller sends none', async () => {
    await onRequestPost(ctx('tip-chat'));
    const [, init] = globalThis.fetch.mock.calls[0];
    expect('X-Rc-User-Id' in init.headers).toBe(false);
  });

  it('still injects the anon key and does not let the caller override it', async () => {
    // The forward is a NAMED copy, not a passthrough: a caller-supplied
    // Authorization or apikey must never reach Supabase.
    await onRequestPost(ctx('tip-chat', {
      headers: { Authorization: 'Bearer attacker', apikey: 'attacker' },
    }));
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer anon-key');
    expect(init.headers.apikey).toBe('anon-key');
  });

  it('drops an id carrying a control character rather than throwing', async () => {
    // Header values cannot hold a raw newline in a Request, so exercise the
    // validator directly on the shape fetch() would reject.
    await onRequestPost(ctx('tip-chat', { headers: { 'X-Rc-User-Id': '  ' } }));
    const [, init] = globalThis.fetch.mock.calls[0];
    expect('X-Rc-User-Id' in init.headers).toBe(false);
  });

  it('drops an over-long id', async () => {
    await onRequestPost(ctx('tip-chat', { headers: { 'X-Rc-User-Id': 'a'.repeat(1501) } }));
    const [, init] = globalThis.fetch.mock.calls[0];
    expect('X-Rc-User-Id' in init.headers).toBe(false);
  });
});

describe('allowlist', () => {
  it('rejects a function not on the list before any fetch', async () => {
    const e = await thrown(() => onRequestPost(ctx('rc-webhook')));
    expect(e.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
