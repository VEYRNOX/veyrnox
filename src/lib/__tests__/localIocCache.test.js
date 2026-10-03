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
//
// The address-comparison describes at the end stub `verify` for the same
// reason: to get a manifest INTO the index. What is handed to `verify`, and
// what is stored, is pinned there too.

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('I3 — the manifest fetch is gated at the module, not the caller', () => {
  it('refuses to fetch in a deniability session', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    deniability.session = true;
    deniability.orDemo = true;

    await expect(mod.refreshManifest()).rejects.toThrow(/I3/);
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

    await expect(mod.refreshManifest()).rejects.toThrow(/I3/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still fetches in a normal session', async () => {
    const fetchSpy = vi.fn(async () => okResponse(manifest('2026-08-09T00:00:00Z')));
    vi.stubGlobal('fetch', fetchSpy);

    // Rejects later (the fake signature will not verify) — we only assert the
    // gate let it THROUGH to the network.
    await expect(mod.refreshManifest()).rejects.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledOnce();
    // Through the proxy, never to the TIP Worker directly: that route is
    // HMAC-only and the wallet must not sign.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/edge/tip-manifest');
    expect(init.method).toBe('POST');
    expect(Object.keys(init.headers).map((h) => h.toLowerCase()).sort())
      .toEqual(['accept', 'content-type']);
    expect(init.body).toBe('{}');
  });

  it('keeps the timeout active while consuming the response body', async () => {
    vi.useFakeTimers();
    let requestSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      requestSignal = init.signal;
      return {
        ok: true,
        status: 200,
        text: () => new Promise((_resolve, reject) => {
          requestSignal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }, { once: true });
        }),
      };
    }));

    const result = expect(mod.refreshManifest()).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(20_000);

    await result;
    expect(requestSignal.aborted).toBe(true);
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
    await expect(mod.refreshManifest())
      .rejects.toThrow(/signature verification failed/);
  });

  it('rejects an unsigned manifest', async () => {
    const m = manifest('2026-08-09T00:00:00Z');
    delete m.signature;
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(m)));
    await expect(mod.refreshManifest()).rejects.toThrow(/unsigned/);
  });

  it('rejects a manifest signed under an unknown key id', async () => {
    const m = manifest('2026-08-09T00:00:00Z');
    m.public_key_id = 'attacker-key-v9';
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(m)));
    await expect(mod.refreshManifest()).rejects.toThrow(/public_key_id/);
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
    await mod.refreshManifest();

    vi.stubGlobal('fetch', vi.fn(async () => okResponse(
      manifest('2026-08-09T00:00:00Z', [{ addr: bad, cat: 'sanctions', src: 'ofac' }]),
    )));
    await mod.refreshManifest();

    expect(mod.lookupLocal(bad)).toMatchObject({ cat: 'sanctions' });
    expect(mod.getCacheMeta().generated_at).toBe('2026-08-09T00:00:00Z');
  });

  it('REFUSES a validly-signed OLDER manifest, keeping the newer one', async () => {
    const bad = '0x000000000000000000000000000000000000dead';
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(
      manifest('2026-08-09T00:00:00Z', [{ addr: bad, cat: 'sanctions', src: 'ofac' }]),
    )));
    await mod.refreshManifest();

    // The replay: an authentic manifest from before `bad` was listed. Every
    // other check passes — key id, signature, shape. Only recency fails.
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-01T00:00:00Z'))));
    await expect(mod.refreshManifest()).rejects.toThrow(/rollback/);

    // The sanctioned address must still screen. Without the check the entry
    // silently disappeared — and in deniability mode there is no network
    // fallback to catch it.
    expect(mod.lookupLocal(bad)).toMatchObject({ cat: 'sanctions' });
    expect(mod.getCacheMeta().generated_at).toBe('2026-08-09T00:00:00Z');
  });

  it('accepts a re-fetch of the SAME manifest (equal timestamps are a no-op)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('2026-08-09T00:00:00Z'))));
    await mod.refreshManifest();
    await expect(mod.refreshManifest()).resolves.toBeUndefined();
  });

  it('refuses a manifest with no usable generated_at (fail closed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(manifest('not-a-date'))));
    await expect(mod.refreshManifest())
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
    await expect(mod.refreshManifest()).rejects.toThrow(/too large/);
  });
});

// ─── Address comparison ─────────────────────────────────────────────────────
//
// TIP publishes canonical addresses: EVM and bech32 lowercased, base58 (legacy
// Bitcoin, Solana, Tron) in its own case. It used to lowercase everything, and
// the wallet used to lowercase both sides, which flagged any case-variant of a
// sanctioned base58 address — a different address — as sanctioned.
//
// The constraint that outranks fixing that: a sanctioned address is never
// missed. Manifests generated before the TIP change carry LOWERCASED base58
// and stay in IndexedDB for as long as a wallet stays offline, so an entry
// that is entirely lowercase is still matched case-insensitively.

const LEGACY_BTC = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
const SOLANA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const TRON = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const EVM = '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b';
const EVM_CHECKSUM = '0xd882cFc20f52f2599D84b8e8D58C7FB62cfE344b';
const BECH32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

describe('canonicalAddress — the same rule as TIP normalizeAddressByShape', () => {
  // These vectors mirror veyrnox-tip src/lib/__tests__/ioc-normalize.test.ts.
  // The two sides must agree or an exact comparison misses.
  it('lowercases EVM addresses in any letter case', () => {
    expect(mod.canonicalAddress(EVM_CHECKSUM)).toBe(EVM);
    expect(mod.canonicalAddress(EVM.toUpperCase())).toBe(EVM);
    expect(mod.canonicalAddress(EVM)).toBe(EVM);
  });

  it('lowercases bech32 Bitcoin addresses, which BIP-173 allows in either case', () => {
    const testnet = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

    expect(mod.canonicalAddress(BECH32.toUpperCase())).toBe(BECH32);
    expect(mod.canonicalAddress(BECH32)).toBe(BECH32);
    expect(mod.canonicalAddress(testnet.toUpperCase())).toBe(testnet);
  });

  it('keeps base58 addresses exactly as written', () => {
    for (const address of [LEGACY_BTC, SOLANA, TRON]) {
      expect(mod.canonicalAddress(address)).toBe(address);
    }
  });

  it('does not fold checksum-invalid or mixed-case bech32-shaped strings', () => {
    const mixed = 'bc1qAr0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    expect(mod.canonicalAddress(mixed)).toBe(mixed);
  });

  it('keeps a valid Solana Base58 address with a bech32-looking prefix case-sensitive', () => {
    const solana = `bc1Q${'q'.repeat(39)}`;
    expect(mod.canonicalAddress(solana)).toBe(solana);
  });

  // "1" and "b" are base58 digits but not bech32 ones, so this is base58 even
  // though it starts with the bech32 prefix.
  it('keeps a base58 address that starts with bc1', () => {
    const address = 'bc1QeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

    expect(mod.canonicalAddress(address)).toBe(address);
  });

  it('trims surrounding whitespace', () => {
    expect(mod.canonicalAddress(` ${LEGACY_BTC}\n`)).toBe(LEGACY_BTC);
  });
});

describe('address comparison — canonical, with lowercased entries still matched in any case', () => {
  let verifySpy;

  beforeEach(() => {
    verifySpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);
  });

  const sanctioned = (addr) => ({ addr, cat: 'sanctions', src: 'ofac-github', reason: 'OFAC-SDN' });

  async function loadManifest(entries) {
    const body = manifest('2026-10-03T06:00:00Z', entries);
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(body)));
    await mod.refreshManifest('https://tip.example');
    return body;
  }

  it('finds a legacy-BTC and a Solana address the manifest carries case-preserved', async () => {
    await loadManifest([sanctioned(LEGACY_BTC), sanctioned(SOLANA)]);

    expect(mod.lookupLocal(LEGACY_BTC)).toMatchObject({ addr: LEGACY_BTC, cat: 'sanctions' });
    expect(mod.lookupLocal(SOLANA)).toMatchObject({ addr: SOLANA, cat: 'sanctions' });
  });

  it('still finds them when the manifest carries them LOWERCASED (a pre-change manifest)', async () => {
    await loadManifest([sanctioned(LEGACY_BTC.toLowerCase()), sanctioned(SOLANA.toLowerCase())]);

    // The address a user screens is the real one, in its own case.
    expect(mod.lookupLocal(LEGACY_BTC)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(SOLANA)).toMatchObject({ cat: 'sanctions' });
  });

  it('does NOT find a case-variant of a case-preserved base58 entry', async () => {
    await loadManifest([sanctioned(LEGACY_BTC), sanctioned(SOLANA)]);
    expect(mod.lookupLocal(LEGACY_BTC)).not.toBeNull();
    expect(mod.lookupLocal(SOLANA)).not.toBeNull();

    // One letter flipped: a different base58 string, so a different address.
    expect(mod.lookupLocal('1boatSLRHtKNngkdXEeobR76b53LETtpyT')).toBeNull();
    expect(mod.lookupLocal('9XQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')).toBeNull();
    // The two variants the old lowercase-both-sides index matched.
    expect(mod.lookupLocal(LEGACY_BTC.toLowerCase())).toBeNull();
    expect(mod.lookupLocal(SOLANA.toUpperCase())).toBeNull();
  });

  it('finds an EVM address in any letter case', async () => {
    await loadManifest([sanctioned(EVM)]);

    expect(mod.lookupLocal(EVM)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(EVM_CHECKSUM)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(EVM.toUpperCase())).toMatchObject({ cat: 'sanctions' });
  });

  it('finds an EVM address the manifest carries in checksum case', async () => {
    await loadManifest([sanctioned(EVM_CHECKSUM)]);

    expect(mod.lookupLocal(EVM)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(EVM.toUpperCase())).toMatchObject({ cat: 'sanctions' });
  });

  it('finds a bech32 address written in uppercase', async () => {
    await loadManifest([sanctioned(BECH32)]);

    expect(mod.lookupLocal(BECH32.toUpperCase())).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(BECH32)).toMatchObject({ cat: 'sanctions' });
  });

  // Tron addresses start with T and Solana ones with anything, so `TB1…` and
  // `Bc1…` lowercase to `tb1…` and `bc1…`. A pre-change manifest carries them
  // that way, and they are still base58 addresses screened in their own case.
  it('still finds a lowercased base58 entry that starts with a bech32 prefix', async () => {
    const tron = 'TB1qHmaT23yvVM2ZWbrrpZb9PusVFin9xQe';
    const solana = 'Bc1QeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
    await loadManifest([sanctioned(tron.toLowerCase()), sanctioned(solana.toLowerCase())]);

    expect(mod.lookupLocal(tron)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(solana)).toMatchObject({ cat: 'sanctions' });
  });

  it('matches each entry of a mixed manifest by its own shape', async () => {
    // During the TIP transition one manifest can carry a sanctioned base58
    // address that is still lowercased next to one already case-preserved.
    await loadManifest([sanctioned(LEGACY_BTC.toLowerCase()), sanctioned(SOLANA)]);

    expect(mod.lookupLocal(LEGACY_BTC)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(SOLANA)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(SOLANA.toLowerCase())).toBeNull();
  });

  it('does not match case variants of a case-preserved Solana address with a bech32 prefix', async () => {
    const solana = `bc1Q${'q'.repeat(39)}`;
    await loadManifest([sanctioned(solana)]);

    expect(mod.lookupLocal(solana)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(solana.toLowerCase())).toBeNull();
  });

  it('reports the sanctions entry when an address is also listed by another feed', async () => {
    // One feed still lowercases, the other publishes the real case. Whichever
    // comes first, and whichever map hits, the sanctions listing is the answer.
    const hack = (addr) => ({ addr, cat: 'hack', src: 'ethrotten' });

    await loadManifest([hack(LEGACY_BTC), sanctioned(LEGACY_BTC.toLowerCase())]);
    expect(mod.lookupLocal(LEGACY_BTC)).toMatchObject({ cat: 'sanctions' });

    await loadManifest([sanctioned(EVM_CHECKSUM), hack(EVM)]);
    expect(mod.lookupLocal(EVM)).toMatchObject({ cat: 'sanctions' });
  });

  it('ignores whitespace around the screened address', async () => {
    await loadManifest([sanctioned(LEGACY_BTC), sanctioned(EVM)]);

    expect(mod.lookupLocal(` ${LEGACY_BTC}\n`)).toMatchObject({ cat: 'sanctions' });
    expect(mod.lookupLocal(` ${EVM_CHECKSUM} `)).toMatchObject({ cat: 'sanctions' });
  });

  it('verifies and stores the payload exactly as received', async () => {
    // Every entry here has a canonical form that differs from what was
    // published, or a case the old index would have folded. Canonicalising is
    // for the index only: the signature is over the payload as received, and
    // the stored copy is re-verified on every hydrate.
    const body = await loadManifest([
      sanctioned(LEGACY_BTC),
      sanctioned(EVM_CHECKSUM),
      sanctioned(BECH32.toUpperCase()),
    ]);

    const verified = new TextDecoder().decode(verifySpy.mock.calls[0][3]);
    expect(JSON.parse(verified)).toEqual(body.payload);
    for (const addr of [LEGACY_BTC, EVM_CHECKSUM, BECH32.toUpperCase()]) {
      expect(verified).toContain(`"addr":"${addr}"`);
    }

    // A fresh module instance has no index; it must rebuild from IndexedDB and
    // hand `verify` the same bytes.
    vi.resetModules();
    const fresh = await import('../localIocCache.js');
    expect(fresh.lookupLocal(LEGACY_BTC)).toBeNull();
    expect(await fresh.hydrateFromCache()).toBe(true);

    expect(verifySpy).toHaveBeenCalledTimes(2);
    expect(new TextDecoder().decode(verifySpy.mock.calls[1][3])).toBe(verified);
    expect(fresh.lookupLocal(LEGACY_BTC)).toMatchObject({ addr: LEGACY_BTC });
    expect(fresh.lookupLocal(LEGACY_BTC.toLowerCase())).toBeNull();
    expect(fresh.lookupLocal(EVM)).toMatchObject({ addr: EVM_CHECKSUM });
    expect(fresh.lookupLocal(BECH32)).toMatchObject({ addr: BECH32.toUpperCase() });
  });
});
