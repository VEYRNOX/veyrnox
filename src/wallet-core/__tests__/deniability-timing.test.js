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
  createHiddenWallet, wipeStealthPool, ensureStealthPool, tryRevealHidden,
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

describe('PIN cohort (Option A REMOVED) — wrong PIN no longer opens a decoy', () => {
  // THREAT-MODEL CHANGE (owner-approved): the deterministic-fallback "Option A" slot
  // is removed. A WRONG PIN that matches NO enrolled path (real/duress/panic/hidden)
  // must now MISS — resolveDeniabilityUnlock returns NO fallback decoy, so the caller
  // throws "Incorrect PIN" instead of silently opening an empty deterministic decoy.
  //
  // The constant-KDF timing equalization is PRESERVED: the PIN cohort now spends the
  // SAME 3 KDFs as the password cohort on every post-primary-miss outcome, with no
  // 4th deterministic-decoy KDF and no early-return short-circuit. So a wrong-PIN miss
  // costs exactly what a duress/panic/hidden hit costs — the error path is the only
  // new signal, never an additional timing oracle on top of it.
  const EXPECTED_PIN_KDFS = 3; // was 4 under Option A; the 4th (fallback) slot is gone
  let deviceSalt;

  beforeEach(async () => {
    localStorage.clear();
    await resetDevice();
    deviceSalt = getOrCreateDeviceSalt();
  });

  function fallbackRan() {
    // The (now-removed) fallback slot was the ONLY KDF keyed by the fixed deviceSalt.
    return kdf.salts.some((s) => s && s.length === deviceSalt.length
      && s.every((b, i) => b === deviceSalt[i]));
  }

  // The opts a PIN-cohort caller USED to pass. After the change these are inert: the
  // resolver ignores them. We still pass them to prove they no longer trigger a slot.
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
    it(`spends ${EXPECTED_PIN_KDFS} KDFs and the fallback slot NEVER runs — ${o.name}`, async () => {
      await o.setup();
      await resolvePin(o.pw);
      // Exactly THREE KDFs (same as the password cohort), all at the shared params.
      expect(kdf.count).toBe(EXPECTED_PIN_KDFS);
      for (const m of kdf.memorySizes) expect(m).toBe(KDF_PARAMS.memorySize);
      // The deterministic-decoy slot is GONE — no KDF keyed by the deviceSalt.
      expect(fallbackRan()).toBe(false);
    });
  }

  it('total miss returns NO fallback decoy (caller will throw "Incorrect PIN")', async () => {
    const r = await resolvePin(WRONG_PW);
    expect(r.panic).toBe(false);
    expect(r.duressMnemonic).toBeNull();
    expect(r.hiddenMnemonic).toBeNull();
    // The decoy is no longer derived — the contract field must be null/absent.
    expect(r.fallbackDecoyMnemonic ?? null).toBeNull();
  });

  it('a wrong PIN miss costs the SAME KDF count as a duress hit (no timing oracle on the error path)', async () => {
    await setDuressVault('legal winner thank year wave sausage worth useful legal winner thank yellow', 'the-duress-pin');
    // Hit
    const hit = await resolvePin('the-duress-pin');
    const hitKdfs = kdf.count;
    expect(payloadMnemonic(hit.duressMnemonic)).toBeTruthy();
    // Miss (fresh device with same single feature configured)
    const miss = await resolvePin(WRONG_PW);
    expect(kdf.count).toBe(hitKdfs); // identical cost — error is the ONLY signal
    expect(miss.duressMnemonic).toBeNull();
    expect(miss.fallbackDecoyMnemonic ?? null).toBeNull();
  });

  it('the PIN cohort now matches the password cohort exactly: 3 KDFs, null fallback', async () => {
    await ensureStealthPool();
    kdf.count = 0; kdf.salts = [];
    const pw = await resolveDeniabilityUnlock(WRONG_PW);            // password cohort
    const pwKdfs = kdf.count;
    expect(pw.fallbackDecoyMnemonic ?? null).toBeNull();
    const pin = await resolvePin(WRONG_PW);                        // PIN cohort
    expect(kdf.count).toBe(pwKdfs);
    expect(pin.fallbackDecoyMnemonic ?? null).toBeNull();
  });
});
