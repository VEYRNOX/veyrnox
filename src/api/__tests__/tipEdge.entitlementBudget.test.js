// src/api/__tests__/tipEdge.entitlementBudget.test.js
//
// #2676: hasRequiredEntitlement() made TWO sequential RevenueCat calls on a
// cold isolate (resolveEntitlementId -> GET .../entitlements, then
// GET .../customers/{id}/active_entitlements) sharing ONE AbortController
// with REVENUECAT_TIMEOUT_MS = 3s for the pair. On a cold isolate the pair
// plus TLS setup could exceed that shared budget, denying a paying
// subscriber with a silent 403 and nothing logged to explain why.
//
// tipEdge.entitlementLookup.test.js already covers this gate structurally
// (source-pattern assertions, comments stripped) and the active_entitlements
// predicate is lifted out and executed directly. That predicate technique
// only reaches a same-tick expression, though, and this bug is about time —
// two async calls racing a shared clock — so it needs the gate's actual
// control flow running, not a pattern match on its text.
//
// This file extracts the WHOLE self-contained entitlement-gate block (its
// constants, its isolate-lifetime resolvedEntitlementId cache, its
// per-customer verdict cache, logEntitlementFailure, resolveEntitlementId,
// hasRequiredEntitlement) and runs it for real, with a fake `fetch` and
// Vitest's fake timers standing in for RevenueCat and the clock. Nothing
// outside that slice — the TIP signing helpers, CORS, the request handler,
// the STATUS header — is pulled in or executed; index.ts itself needed no
// exports or test-only hooks for this, because `new Function` binds `fetch`
// and `Deno` as local parameters that shadow the globals the extracted code
// already references.
//
// esbuild strips the TypeScript syntax (type annotations, `as` casts) that
// `new Function` cannot parse on its own — esbuild is already a project
// devDependency (it's Vite's own TS/JSX transform), so this reaches for
// something already installed rather than adding a parser.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const root = process.cwd();
const chatSrc = readFileSync(
  join(root, 'supabase', 'functions', 'tip-chat', 'index.ts'), 'utf8');

const START = 'const ENTITLEMENT_CACHE_TTL_MS';
const END = '\nserve(async (req) => {';
const startIdx = chatSrc.indexOf(START);
const endIdx = chatSrc.indexOf(END);

describe('extraction anchors', () => {
  it('found both anchors in the current source', () => {
    // If this fails, the gate was restructured — update START/END above
    // rather than skip this file.
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
  });
});

const gateSrc = chatSrc.slice(startIdx, endIdx);
const gateJs = transformSync(gateSrc, { loader: 'ts', target: 'esnext' }).code;

const REVENUECAT_ID = 'entl262ea1e9d4';
const OTHER_ENTITLEMENT_ID = 'entlf563332478';

function abortError() {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// Resolves with `makeBody()` after `ms` (driven by whatever setTimeout is
// live when this runs — real or Vitest's faked one). Rejects with an
// AbortError if `signal` fires first, exactly like a real fetch(), so the
// gate's own per-call AbortController is genuinely exercised rather than
// assumed.
function delayedResponse(ms, makeBody, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const t = setTimeout(() => resolve(makeBody()), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(abortError());
    });
  });
}

// A fetch that never resolves on its own — only an abort ends it. Stands in
// for a RevenueCat call that hangs past its budget.
function hangingResponse(signal) {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()));
  });
}

function buildGate({ fetchImpl, env = {} }) {
  const logs = [];
  const fakeConsole = { error: (...args) => logs.push(args.join(' ')) };
  const fakeDeno = { env: { get: (k) => env[k] } };
  const factory = new Function(
    'fetch', 'Deno', 'console', 'AbortController', 'setTimeout', 'clearTimeout',
    `${gateJs}
return {
  hasRequiredEntitlement,
  resolveEntitlementId,
  _resetResolvedId: () => { resolvedEntitlementId = null; },
};`,
  );
  const gate = factory(
    fetchImpl,
    fakeDeno,
    fakeConsole,
    globalThis.AbortController,
    globalThis.setTimeout,
    globalThis.clearTimeout,
  );
  return { ...gate, logs };
}

const baseEnv = {
  REVENUECAT_SECRET_KEY: 'sk_test_not_real',
  REVENUECAT_PROJECT_ID: 'proj_test',
};

const listOkBody = { items: [{ id: REVENUECAT_ID, lookup_key: 'ai_security_protection' }] };
const activeOkBody = { items: [{ entitlement_id: REVENUECAT_ID, expires_at: null }] };
const activeUnmatchedBody = { items: [{ entitlement_id: OTHER_ENTITLEMENT_ID, expires_at: null }] };

describe('tip-chat entitlement gate: independent per-call timeout budgets (#2676)', () => {
  it('cold path: two sequential calls, both fast, grants an active entitlement', async () => {
    const calls = { list: 0, active: 0 };
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) {
        calls.active += 1;
        return jsonResponse(200, activeOkBody);
      }
      calls.list += 1;
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-cold')).resolves.toBe(true);
    expect(calls.list).toBe(1);
    expect(calls.active).toBe(1);
  });

  it('warm path: the resolved entitlement id is reused across customers without a second list call', async () => {
    const calls = { list: 0, active: 0 };
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) {
        calls.active += 1;
        return jsonResponse(200, activeOkBody);
      }
      calls.list += 1;
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-warm-a')).resolves.toBe(true);
    await expect(hasRequiredEntitlement('user-warm-b')).resolves.toBe(true);
    // Two customers, but the entitlement id is resolved once per isolate.
    expect(calls.list).toBe(1);
    expect(calls.active).toBe(2);
  });

  it('denies and logs when the list call hangs past its own budget', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = async (url, opts) => {
        if (url.includes('/customers/')) throw new Error('active_entitlements must not be called: list never resolved');
        return hangingResponse(opts.signal);
      };
      const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
      const p = hasRequiredEntitlement('user-list-timeout');
      await vi.advanceTimersByTimeAsync(3001);
      await expect(p).resolves.toBe(false);
      expect(logs.some((l) => l.includes('resolveEntitlementId timed out after 3000ms'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies and logs when the active_entitlements call hangs past its own budget', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = async (url, opts) => {
        if (url.includes('/customers/')) return hangingResponse(opts.signal);
        return jsonResponse(200, listOkBody);
      };
      const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
      const p = hasRequiredEntitlement('user-active-timeout');
      await vi.advanceTimersByTimeAsync(3001);
      await expect(p).resolves.toBe(false);
      expect(logs.some((l) => l.includes('active_entitlements timed out after 3000ms'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a slow list call (~2.5s) does not starve the active_entitlements call\'s own budget', async () => {
    vi.useFakeTimers();
    try {
      const calls = { list: 0, active: 0 };
      const fetchImpl = (url, opts) => {
        if (url.includes('/customers/')) {
          calls.active += 1;
          return delayedResponse(2500, () => jsonResponse(200, activeOkBody), opts.signal);
        }
        calls.list += 1;
        return delayedResponse(2500, () => jsonResponse(200, listOkBody), opts.signal);
      };
      const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
      const p = hasRequiredEntitlement('user-independent-budget');
      // Total elapsed by the end (~5000ms) exceeds the OLD shared 3000ms
      // budget for the pair. Each call here only ever needs to survive its
      // OWN 3000ms window, which 2500ms does.
      await vi.advanceTimersByTimeAsync(2500); // list resolves
      await vi.advanceTimersByTimeAsync(2500); // active resolves
      await expect(p).resolves.toBe(true);
      expect(calls.list).toBe(1);
      expect(calls.active).toBe(1);
      expect(logs).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies and logs on a 5xx from active_entitlements, without caching it', async () => {
    const calls = { active: 0 };
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) {
        calls.active += 1;
        return jsonResponse(500, { error: 'internal' });
      }
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-5xx')).resolves.toBe(false);
    expect(logs.some((l) => l.includes('active_entitlements upstream status 500'))).toBe(true);
    // Not cached: a second call within the negative-cache window must hit
    // RevenueCat again, because a 500 is a fact about RevenueCat, not this
    // customer.
    await expect(hasRequiredEntitlement('user-5xx')).resolves.toBe(false);
    expect(calls.active).toBe(2);
  });

  it('denies and logs on a 5xx from the list call, and never reaches active_entitlements', async () => {
    const calls = { list: 0, active: 0 };
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) {
        calls.active += 1;
        return jsonResponse(200, activeOkBody);
      }
      calls.list += 1;
      return jsonResponse(500, { error: 'internal' });
    };
    const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-list-5xx')).resolves.toBe(false);
    expect(logs.some((l) => l.includes('resolveEntitlementId upstream status 500'))).toBe(true);
    expect(calls.list).toBe(1);
    expect(calls.active).toBe(0);
  });

  it('denies on an unknown customer (404) and caches the negative verdict', async () => {
    const calls = { active: 0 };
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) {
        calls.active += 1;
        return jsonResponse(404, { error: 'not_found' });
      }
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-404')).resolves.toBe(false);
    await expect(hasRequiredEntitlement('user-404')).resolves.toBe(false);
    // 404 IS a verdict about this customer, so the second call is served
    // from the negative cache rather than hitting RevenueCat again.
    expect(calls.active).toBe(1);
  });

  it('denies when the customer holds a different entitlement, not this one', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) return jsonResponse(200, activeUnmatchedBody);
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-wrong-tier')).resolves.toBe(false);
  });

  it('denies network errors from either call and logs them without a status number', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/customers/')) throw new TypeError('fetch failed');
      return jsonResponse(200, listOkBody);
    };
    const { hasRequiredEntitlement, logs } = buildGate({ fetchImpl, env: baseEnv });
    await expect(hasRequiredEntitlement('user-network-error')).resolves.toBe(false);
    expect(logs.some((l) => l.includes('active_entitlements network error'))).toBe(true);
    // The log must never repeat the raw error, which could carry request
    // detail beyond what's safe to record.
    expect(logs.some((l) => l.includes('fetch failed'))).toBe(false);
  });
});
