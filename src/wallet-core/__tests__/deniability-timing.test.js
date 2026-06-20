// wallet-core/__tests__/deniability-timing.test.js
//
// SAST M2 — assert the COMBINED deniability resolution does a CONSTANT number of
// Argon2id KDFs on a wrong/failed unlock REGARDLESS of which features (panic /
// duress / hidden) are configured. A variable KDF count would let an attacker who
// times a few wrong guesses infer how many deniability features exist — exactly
// what those features must hide.
//
// We count real KDF invocations by wrapping hash-wasm's argon2id (the single KDF
// primitive every vault decrypt/encrypt funnels through), calling the real impl
// so the crypto still behaves. resolveDeniabilityUnlock is tested directly (no
// React), which is the orchestration WalletProvider.unlock delegates to.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted counter shared with the mock factory (vi.mock is hoisted above imports).
const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [], salts: [] }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      kdf.count += 1;
      kdf.memorySizes.push(opts && opts.memorySize);
      kdf.salts.push(opts && opts.salt ? Array.from(opts.salt) : null);
      return orig.argon2id(opts, ...rest);
    },
  };
});

import { resolveDeniabilityUnlock } from '../deniabilityUnlock.js';
import { KDF_PARAMS } from '../vault.js';
import { getOrCreateDeviceSalt } from '../decoyFallback.js';
import { validateMnemonic } from '../mnemonic.js';
import { parseVault } from '../multiVault.js';

// H2: duress/hidden unlock now returns the decrypted PAYLOAD string — a FIXED-LENGTH
// multi-seed container JSON (or a legacy bare mnemonic). Unwrap to the bare mnemonic
// for the equality assertions below (parseVault handles both formats).
function payloadMnemonic(payload) {
  if (payload == null) return null;
  return parseVault(payload).container.wallets[0].mnemonic;
}
import { setDuressVault, clearDuressVault, tryDuressUnlock } from '../duress.js';
import { setPanicVault, clearPanicVault } from '../panic.js';
import {
  createHiddenWallet, wipeStealthPool, ensureStealthPool, tryRevealHidden, slotForSecret,
} from '../stealth.js';

// resolveDeniabilityUnlock spends exactly: panic(1) + duress(1) + stealth(1).
const EXPECTED_KDFS = 3;

const WRONG_PW = 'definitely-not-any-configured-secret';

async function resetDevice() {
  await wipeStealthPool();
  await clearDuressVault();
  await clearPanicVault();
}

describe('SAST M2 — constant KDF count on wrong unlock', () => {
  beforeEach(async () => {
    await resetDevice();
  });

  // The matrix from the finding: every configuration must cost the SAME number
  // of KDFs on a wrong password.
  const configs = [
    { name: 'no deniability features configured', setup: async () => {} },
    {
      name: 'duress only',
      setup: async () => { await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-pw-aaaa'); },
    },
    {
      name: 'panic only',
      setup: async () => { await setPanicVault('panic-pin-aaaa'); },
    },
    {
      name: 'panic + duress',
      setup: async () => {
        await setPanicVault('panic-pin-bbbb');
        await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-pw-bbbb');
      },
    },
    {
      name: 'hidden wallet present',
      setup: async () => { await createHiddenWallet('hidden-secret-cccc'); },
    },
    {
      name: 'all features (panic + duress + hidden)',
      setup: async () => {
        await setPanicVault('panic-pin-dddd');
        await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-pw-dddd');
        await createHiddenWallet('hidden-secret-dddd');
      },
    },
  ];

  for (const cfg of configs) {
    it(`spends ${EXPECTED_KDFS} KDFs (all at current params) on a wrong password — ${cfg.name}`, async () => {
      await cfg.setup();
      await ensureStealthPool();      // seeded in real flow; ensure for a clean count
      kdf.count = 0;                  // measure ONLY the resolution, not the setup
      kdf.memorySizes = [];
      const r = await resolveDeniabilityUnlock(WRONG_PW);
      expect(kdf.count).toBe(EXPECTED_KDFS);
      // EVERY KDF (real attempt OR dummy pad) must run at the CURRENT params. A
      // dummy pad at stale params would cost differently than a real attempt and
      // reintroduce the presence/count timing tell across the M3 param raise.
      expect(kdf.memorySizes).toHaveLength(EXPECTED_KDFS);
      for (const m of kdf.memorySizes) expect(m).toBe(KDF_PARAMS.memorySize);
      // A wrong password matches nothing.
      expect(r.panic).toBe(false);
      expect(r.duressMnemonic).toBeNull();
      expect(r.hiddenMnemonic).toBeNull();
    });
  }

  it('a DURESS hit costs the SAME KDF count as a wrong guess (no short-circuit tell)', async () => {
    const decoy = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    await setDuressVault(decoy, 'the-duress-pw');
    await ensureStealthPool();
    kdf.count = 0;
    const r = await resolveDeniabilityUnlock('the-duress-pw');
    // Same constant cost as a miss — the stealth attempt is NOT short-circuited.
    expect(kdf.count).toBe(EXPECTED_KDFS);
    expect(payloadMnemonic(r.duressMnemonic)).toBe(decoy);
    expect(r.panic).toBe(false);
  });

  it('a HIDDEN-wallet hit costs the SAME KDF count as a wrong guess', async () => {
    const created = await createHiddenWallet('reveal-me-secret');
    await ensureStealthPool();
    kdf.count = 0;
    const r = await resolveDeniabilityUnlock('reveal-me-secret');
    expect(kdf.count).toBe(EXPECTED_KDFS);
    expect(payloadMnemonic(r.hiddenMnemonic)).toBe(created.mnemonic);
    expect(r.duressMnemonic).toBeNull();
    expect(r.panic).toBe(false);
  });

  it('a PANIC hit costs the SAME KDF count as a wrong guess (resolution does not wipe)', async () => {
    await setPanicVault('the-panic-pin');
    await ensureStealthPool();
    kdf.count = 0;
    const r = await resolveDeniabilityUnlock('the-panic-pin');
    expect(kdf.count).toBe(EXPECTED_KDFS);
    expect(r.panic).toBe(true); // caller (WalletProvider) performs the wipe
  });

  it('sanity: the wrapped argon2id still performs real crypto (decrypt round-trips)', async () => {
    await createHiddenWallet('roundtrip-secret-xyz');
    expect(await tryRevealHidden('roundtrip-secret-xyz')).not.toBeNull();
    // Duress decrypt also works through the wrapped KDF.
    const decoy = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    await setDuressVault(decoy, 'rt-duress');
    expect(payloadMnemonic(await tryDuressUnlock('rt-duress'))).toBe(decoy);
  });
});

describe('PIN cohort (Option A) — 4th constant slot EXECUTES unconditionally', () => {
  // The deterministic-fallback slot must run on EVERY post-miss outcome — even when
  // an enrolled path (panic/duress/hidden) wins — or total-miss becomes timeable.
  // We assert per-slot EXECUTION (the fallback's deviceSalt appears among the KDF
  // salts) on each outcome, not merely that argon2id was called four times.
  const EXPECTED_PIN_KDFS = 4;
  let deviceSalt;

  beforeEach(async () => {
    localStorage.clear();
    await resetDevice();
    deviceSalt = getOrCreateDeviceSalt();
  });

  function fallbackRan() {
    // The fallback slot is the ONLY KDF keyed by the fixed deviceSalt.
    return kdf.salts.some((s) => s && s.length === deviceSalt.length
      && s.every((b, i) => b === deviceSalt[i]));
  }

  async function resolvePin(pw) {
    await ensureStealthPool();
    kdf.count = 0; kdf.memorySizes = []; kdf.salts = [];
    return resolveDeniabilityUnlock(pw, { deterministicFallback: true, deviceSalt });
  }

  const outcomes = [
    { name: 'total miss', setup: async () => {}, pw: WRONG_PW },
    {
      name: 'duress hit',
      setup: async () => { await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-pin-1'); },
      pw: 'duress-pin-1',
    },
    {
      name: 'panic hit',
      setup: async () => { await setPanicVault('panic-pin-1'); },
      pw: 'panic-pin-1',
    },
    {
      name: 'hidden hit',
      setup: async () => { await createHiddenWallet('hidden-secret-1'); },
      pw: 'hidden-secret-1',
    },
  ];

  for (const o of outcomes) {
    it(`spends ${EXPECTED_PIN_KDFS} KDFs AND the fallback slot executes — ${o.name}`, async () => {
      await o.setup();
      const r = await resolvePin(o.pw);
      // Exactly four KDFs, all at the shared params.
      expect(kdf.count).toBe(EXPECTED_PIN_KDFS);
      for (const m of kdf.memorySizes) expect(m).toBe(KDF_PARAMS.memorySize);
      // The 4th slot EXECUTED — even when an enrolled path won (no short-circuit).
      expect(fallbackRan()).toBe(true);
    });
  }

  // Read the salt bytes of the vault-shaped blob stored under `key` in the shared
  // 'veyrnox-vault'/'vault' store, so we can positively identify WHICH slot's KDF
  // ran by matching its (stable, per-blob) salt against the captured kdf.salts.
  function readBlobSaltBytes(key) {
    return new Promise((resolve) => {
      const req = indexedDB.open('veyrnox-vault', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
      };
      req.onsuccess = () => {
        const db = req.result;
        const r = db.transaction('vault', 'readonly').objectStore('vault').get(key);
        r.onsuccess = () => {
          const blob = r.result; db.close();
          if (!blob || !blob.salt) { resolve(null); return; }
          const s = atob(blob.salt);
          resolve(Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)));
        };
        r.onerror = () => { db.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    });
  }

  function saltPresent(saltBytes) {
    return saltBytes != null && kdf.salts.some((s) => s && s.length === saltBytes.length
      && s.every((b, i) => b === saltBytes[i]));
  }

  it('all four slots execute, each identified by its KDF salt (self-contained) — total miss with panic+duress+hidden configured', async () => {
    // Configure panic + duress + a hidden wallet so each of those slots hashes a
    // REAL, salt-identifiable blob (not a random dummy). A WRONG pin makes every
    // slot run its KDF and miss — the total-miss case, fully instrumented so the
    // four-slot property is proven in ONE test, not composed across other tests.
    await setPanicVault('panic-allfour');
    await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'duress-allfour');
    await createHiddenWallet('hidden-allfour');
    await ensureStealthPool();

    // The exact salt each slot WILL hash on WRONG_PW:
    const panicSalt = await readBlobSaltBytes('tertiary');
    const duressSalt = await readBlobSaltBytes('secondary');
    const hiddenSlotSalt = await readBlobSaltBytes(await slotForSecret(WRONG_PW));

    kdf.count = 0; kdf.memorySizes = []; kdf.salts = [];
    const r = await resolveDeniabilityUnlock(WRONG_PW, { deterministicFallback: true, deviceSalt });

    expect(kdf.count).toBe(4);
    expect(saltPresent(panicSalt)).toBe(true);      // panic slot executed
    expect(saltPresent(duressSalt)).toBe(true);     // duress slot executed
    expect(saltPresent(hiddenSlotSalt)).toBe(true); // hidden slot executed
    expect(fallbackRan()).toBe(true);               // fallback slot executed
    // Total miss => the fallback decoy is what resolves (no enrolled path won).
    expect(r.panic).toBe(false);
    expect(r.duressMnemonic).toBeNull();
    expect(r.hiddenMnemonic).toBeNull();
    expect(r.fallbackDecoyMnemonic).toBeTruthy();
  });

  it('total miss returns a valid deterministic fallback decoy (no throw, no error state)', async () => {
    const r = await resolvePin(WRONG_PW);
    expect(r.panic).toBe(false);
    expect(r.duressMnemonic).toBeNull();
    expect(r.hiddenMnemonic).toBeNull();
    expect(r.fallbackDecoyMnemonic).toBeTruthy();
    expect(validateMnemonic(r.fallbackDecoyMnemonic)).toBe(true);
    // Deterministic: same PIN+salt resolves to the same empty wallet.
    const again = await resolvePin(WRONG_PW);
    expect(again.fallbackDecoyMnemonic).toBe(r.fallbackDecoyMnemonic);
  });

  it('password cohort is unchanged: no fallback slot, 3 KDFs, null fallback', async () => {
    await ensureStealthPool();
    kdf.count = 0; kdf.salts = [];
    const r = await resolveDeniabilityUnlock(WRONG_PW); // no opts => password cohort
    expect(kdf.count).toBe(3);
    expect(r.fallbackDecoyMnemonic ?? null).toBeNull();
  });
});
