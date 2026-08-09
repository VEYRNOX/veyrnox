// lib/__tests__/localIocCache.test.js
//
// Regression tests for the three findings raised against the local IOC cache
// in docs/security-diffs/diff-2026-08-09.md. Each `describe` below pins one of
// them; all three were live on `main` when this file was written.
//
//   1. I3 egress — the gate sat at WalletProvider's call site and used the
//      weaker predicate, so demo sessions fetched.
//   2. I3 residue — `indexedDB.open()` creates the database, so a decoy
//      session's READ minted a store that a panic wipe had erased.
//   3. Rollback — a validly-signed OLDER manifest was accepted, silently
//      downgrading screening on the one path (deniability/offline) that has
//      no network fallback.
//
// ON MOCKING THE SIGNATURE: `verifies a real signature` below runs against the
// REAL crypto.subtle with the module's hardcoded public key, so the control
// itself is proven here. Only the rollback tests stub `verify`, because we do
// not hold the private key and cannot mint a manifest that passes for real —
// the stub exists to REACH the rollback branch, which sits deliberately after
// verification. Nothing here weakens the shipped check.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const deniability = { session: false, orDemo: false };
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => deniability.session,
  isDeniabilityOrDemoActive: () => deniability.orDemo,
}));

const DB_NAME = 'veyrnox-ioc-cache';

/** True iff the IndexedDB database currently exists. */
async function dbExists() {
  if (typeof indexedDB.databases === 'function') {
    const list = await indexedDB.databases();
    return list.some((d) => d.name === DB_NAME);
  }
  // Fallback: opening at version 1 fires onupgradeneeded iff it did not exist.
  return await new Promise((resolve) => {
    let existed = true;
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { existed = false; };
    req.onsuccess = () => { req.result.close(); resolve(existed); };
    req.onerror = () => resolve(false);
  });
}

function deleteDb() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
}

function manifest(generatedAt, entries = []) {
  return {
    public_key_id: 'veyrnox-ioc-v1',
    signature: 'ZmFrZS1zaWduYXR1cmU=',
    payload: {
      generated_at: generatedAt,
      ttl_seconds: 86400,
      counts: { total: entries.length },
      entries,
    },
  };
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

let mod;

beforeEach(async () => {
  deniability.session = false;
  deniability.orDemo = false;
  await deleteDb();
  vi.resetModules();
  mod = await import('../localIocCache.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('I3 — the manifest fetch is gated at the module, not the caller', () => {
  it('refuses to fetch in a deniability session', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    deniability.session = true;
    deniability.orDemo = true;

    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/I3/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to fetch in a DEMO session, where only the OR-demo predicate is true', async () => {
    // This is the exact gap the finding named. The old gate was
    // `decoyRef || hiddenRef` — i.e. isDeniabilitySessionActive() — which is
    // FALSE here. If the module reads that weaker predicate the fetch fires
    // and this test goes red; that divergence is the whole point of the
    // mock returning different values for the two functions.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    deniability.session = false;
    deniability.orDemo = true;

    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/I3/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still fetches in a normal session', async () => {
    const fetchSpy = vi.fn(async () => okResponse(manifest('2026-08-09T00:00:00Z')));
    vi.stubGlobal('fetch', fetchSpy);

    // Rejects later (the fake signature will not verify) — we only assert the
    // gate let it THROUGH to the network.
    await expect(mod.refreshManifest('https://tip.example')).rejects.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe('https://tip.example/api/v1/manifest');
  });
});

describe('I3 residue — a read must not bring the database into existence', () => {
  it('hydrateFromCache does not create the store when no cache exists', async () => {
    expect(await dbExists()).toBe(false);

    const ok = await mod.hydrateFromCache();

    expect(ok).toBe(false);
    // The finding: indexedDB.open() creates the DB, so this used to be true
    // and a decoy session left a store behind — after a panic wipe had
    // deliberately erased it.
    expect(await dbExists()).toBe(false);
  });

  it('clearLocalIocCache does not create the store either', async () => {
    expect(await dbExists()).toBe(false);
    await mod.clearLocalIocCache();
    expect(await dbExists()).toBe(false);
  });

  it('lookupLocal returns null rather than throwing on a missing address', () => {
    expect(mod.lookupLocal(undefined)).toBeNull();
    expect(mod.lookupLocal('')).toBeNull();
  });
});

describe('signature verification (real crypto, hardcoded key)', () => {
  it('rejects a manifest whose signature does not verify', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-09T00:00:00Z'))));
    await expect(mod.refreshManifest('https://tip.example'))
      .rejects.toThrow(/signature verification failed/);
  });

  it('rejects an unsigned manifest', async () => {
    const m = manifest('2026-08-09T00:00:00Z');
    delete m.signature;
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(m)));
    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/unsigned/);
  });

  it('rejects a manifest signed under an unknown key id', async () => {
    const m = manifest('2026-08-09T00:00:00Z');
    m.public_key_id = 'attacker-key-v9';
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(m)));
    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/public_key_id/);
  });
});

describe('rollback — a valid signature does not make a manifest current', () => {
  // See the header note: verification is stubbed ONLY to reach the branch
  // under test. The real check is proven in the describe above.
  beforeEach(() => {
    vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);
  });

  it('accepts a newer manifest over a cached one', async () => {
    const bad = '0x000000000000000000000000000000000000dead';
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-01T00:00:00Z'))));
    await mod.refreshManifest('https://tip.example');

    vi.stubGlobal('fetch', vi.fn(async () => okResponse(
      manifest('2026-08-09T00:00:00Z', [{ addr: bad, cat: 'sanctions', src: 'ofac' }]),
    )));
    await mod.refreshManifest('https://tip.example');

    expect(mod.lookupLocal(bad)).toMatchObject({ cat: 'sanctions' });
    expect(mod.getCacheMeta().generated_at).toBe('2026-08-09T00:00:00Z');
  });

  it('REFUSES a validly-signed OLDER manifest, keeping the newer one', async () => {
    const bad = '0x000000000000000000000000000000000000dead';
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(
      manifest('2026-08-09T00:00:00Z', [{ addr: bad, cat: 'sanctions', src: 'ofac' }]),
    )));
    await mod.refreshManifest('https://tip.example');

    // The replay: an authentic manifest from before `bad` was listed. Every
    // other check passes — key id, signature, shape. Only recency fails.
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-01T00:00:00Z'))));
    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/rollback/);

    // The sanctioned address must still screen. Without the check the entry
    // silently disappeared — and in deniability mode there is no network
    // fallback to catch it.
    expect(mod.lookupLocal(bad)).toMatchObject({ cat: 'sanctions' });
    expect(mod.getCacheMeta().generated_at).toBe('2026-08-09T00:00:00Z');
  });

  it('accepts a re-fetch of the SAME manifest (equal timestamps are a no-op)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-09T00:00:00Z'))));
    await mod.refreshManifest('https://tip.example');
    await expect(mod.refreshManifest('https://tip.example')).resolves.toBeUndefined();
  });

  it('refuses a manifest with no usable generated_at (fail closed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('not-a-date'))));
    await expect(mod.refreshManifest('https://tip.example'))
      .rejects.toThrow(/generated_at/);
  });
});

describe('payload cap', () => {
  it('refuses to parse an oversized manifest', async () => {
    const huge = 'x'.repeat(9 * 1024 * 1024);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => huge,
    })));
    await expect(mod.refreshManifest('https://tip.example')).rejects.toThrow(/too large/);
  });
});
