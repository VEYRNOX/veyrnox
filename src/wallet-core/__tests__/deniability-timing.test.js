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
const kdf = vi.hoisted(() => ({ count: 0 }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (...args) => { kdf.count += 1; return orig.argon2id(...args); },
  };
});

import { resolveDeniabilityUnlock } from '../deniabilityUnlock.js';
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
    it(`spends ${EXPECTED_KDFS} KDFs on a wrong password — ${cfg.name}`, async () => {
      await cfg.setup();
      await ensureStealthPool(); // seeded in real flow; ensure for a clean count
      kdf.count = 0;             // measure ONLY the resolution, not the setup
      const r = await resolveDeniabilityUnlock(WRONG_PW);
      expect(kdf.count).toBe(EXPECTED_KDFS);
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
    expect(r.duressMnemonic).toBe(decoy);
    expect(r.panic).toBe(false);
  });

  it('a HIDDEN-wallet hit costs the SAME KDF count as a wrong guess', async () => {
    const created = await createHiddenWallet('reveal-me-secret');
    await ensureStealthPool();
    kdf.count = 0;
    const r = await resolveDeniabilityUnlock('reveal-me-secret');
    expect(kdf.count).toBe(EXPECTED_KDFS);
    expect(r.hiddenMnemonic).toBe(created.mnemonic);
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
    expect(await tryDuressUnlock('rt-duress')).toBe(decoy);
  });
});
