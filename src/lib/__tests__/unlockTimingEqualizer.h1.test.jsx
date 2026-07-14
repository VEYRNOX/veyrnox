// H-1 (unlock-timing oracle) — EMPIRICAL per-outcome KDF-count equality.
//
// Static analysis claimed WalletProvider.unlock() leaves a real-PIN-vs-failure
// timing oracle: the primary-success path spends FEWER Argon2id KDFs than any
// failure/duress outcome, only partly bridged by a magic `setTimeout` equalizer
// (PRIMARY_UNLOCK_EQUALIZER_MS). A stopwatch at the prompt could then distinguish
// "the real primary secret was entered" from a duress secret or a wrong guess — a
// deniability (I3) concern.
//
// This test does NOT trust the static claim. It COUNTS real Argon2id invocations by
// wrapping hash-wasm's argon2id (the single KDF primitive every vault decrypt /
// verifier derivation funnels through) and driving the ACTUAL WalletProvider.unlock()
// flow for three outcomes:
//   (a) primary success  — the correct real PIN opens the primary vault
//   (b) duress hit        — a duress secret opens the decoy vault
//   (c) total miss        — a wrong secret matches nothing (throws)
// The contract: all three must spend the SAME number of KDFs. Wall-clock equality
// then follows because every real KDF runs at the shared KDF_PARAMS (documented
// residual in the test at the bottom).
//
// We MOCK ONLY the keystore facade (so `keyStore.unlock` deterministically models the
// real "exactly one Argon2id derive, succeed-or-throw" behaviour and the off-critical-
// path `void saveVaultContents` re-persist is a no-op) — the deniability resolver,
// stealth pool, duress/panic storage, and credential verifier are all the REAL modules,
// so the counted KDFs are the genuine unlock cost, not a stub.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// Hoisted KDF counter shared with the hash-wasm mock factory (both are hoisted). Also
// records the REQUESTED memorySize of every call so we can pin the param PROFILE (the
// [P1] invariant), not merely the count.
const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [] }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      kdf.count += 1;
      kdf.memorySizes.push(opts && opts.memorySize);
      return orig.argon2id(opts, ...rest);
    },
  };
});

// The primary vault password (correct real PIN). Anything else -> the mock unlock
// throws, exactly like a real keystore decrypt (1 KDF spent, GCM auth fails).
const PRIMARY_PW = 'correct-horse-battery-staple-pin';
const DECOY_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

vi.mock('@/wallet-core/keystore', () => {
  const PRIMARY = 'correct-horse-battery-staple-pin';
  const MNEMONIC =
    'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const ks = {
    async hasVault() { return true; },
    async hasVaultKekWrap() { return false; },
    async unlock(password) {
      // Model the REAL keystore's single Argon2id derive so it registers in the spy.
      // Params are deliberately CHEAP: the spy counts CALLS, not cost — the contract
      // this test pins is KDF COUNT. (Production keyStore.unlock derives at KDF_PARAMS;
      // wall-clock equality across outcomes is argued from all real KDFs sharing
      // KDF_PARAMS, noted at the bottom of this file.)
      const { argon2id } = await import('hash-wasm');
      await argon2id({
        password: new TextEncoder().encode(String(password)),
        salt: new Uint8Array(16),
        parallelism: 1, iterations: 1, memorySize: 1024, hashLength: 32,
        outputType: 'binary',
      });
      if (password === PRIMARY) return MNEMONIC;
      throw new Error('wrong password'); // real keystore rethrows decryptVault's error
    },
    // In production this is `void`-called (fire-and-forget) on the primary path to
    // refresh lastUnlockAt — it is NOT awaited, so it does not contribute to unlock
    // latency. Model it as a no-op (0 KDF) so it cannot confound the critical-path count.
    async saveVaultContents() {},
    getHardwareFactor: async () => new Uint8Array(32),
    async createVault() {},
    async changePassword() {},
    lock() {},
    async clearVault() {},
    setLockHook() {},
    downgradeFromHardwareWrap: async () => {},
  };
  return {
    getKeyStore: () => ks,
    webKeyStore: ks,
    withLockSuppressed: (fn) => Promise.resolve().then(fn),
  };
});

// Real deniability storage modules (NOT mocked) — the counted KDFs on the failure
// path are their genuine constant-3 cost.
import { setDuressVault, clearDuressVault } from '@/wallet-core/duress';
import { clearPanicVault } from '@/wallet-core/panic';
import { wipeStealthPool, ensureStealthPool } from '@/wallet-core/stealth';

// Import the provider AFTER the mocks are registered.
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

let ctx;
function Capture() {
  ctx = useWallet();
  return null;
}
async function renderProvider() {
  await act(async () => {
    render(
      <WalletProvider>
        <Capture />
      </WalletProvider>,
    );
  });
}

async function resetDevice() {
  await wipeStealthPool();
  await clearDuressVault();
  await clearPanicVault();
}

// Drive one unlock() call and return the number of KDFs spent DURING it (the awaited
// critical-path cost an attacker with a stopwatch measures). `expectThrow` lets the
// total-miss case swallow the re-thrown primary error.
async function countUnlockKdfs(password, { expectThrow = false } = {}) {
  kdf.count = 0;
  kdf.memorySizes = [];
  let threw = false;
  await act(async () => {
    try {
      await ctx.unlock(password);
    } catch {
      threw = true;
    }
  });
  if (expectThrow) expect(threw).toBe(true); else expect(threw).toBe(false);
  return { count: kdf.count, profile: [...kdf.memorySizes].sort((a, b) => a - b) };
}

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  await resetDevice();
});
afterEach(() => {
  cleanup();
});

describe('H-1 — unlock() spends the SAME KDF count on success, duress, and miss', () => {
  it('(a) primary success, (b) duress hit, and (c) total miss are KDF-count equal', async () => {
    // Configure a single duress vault (the decoy). Its secret differs from the
    // primary PIN, so unlocking with it MISSES the primary vault and routes through
    // the deniability resolver.
    const DURESS_PW = 'duress-secret-9999';
    await setDuressVault(DECOY_MNEMONIC, DURESS_PW);
    await ensureStealthPool(); // seeded in the real flow; ensure a clean starting slot

    await renderProvider();

    // (a) primary success — correct real PIN
    const success = await countUnlockKdfs(PRIMARY_PW);
    expect(ctx.isDecoy).toBe(false);

    // (b) duress hit — the decoy opens
    const duress = await countUnlockKdfs(DURESS_PW);
    expect(ctx.isDecoy).toBe(true);

    // (c) total miss — matches nothing, unlock throws
    const miss = await countUnlockKdfs('totally-wrong-guess-0000', { expectThrow: true });

    // Surface the observed counts + profiles in the failure message (RED evidence).
    const observed = {
      successCount: success.count, duressCount: duress.count, missCount: miss.count,
      successProfile: success.profile, duressProfile: duress.profile, missProfile: miss.profile,
    };
    void observed;

    // THE CONTRACT (count): every outcome costs the same NUMBER of KDFs.
    expect(success.count).toBe(miss.count);
    expect(duress.count).toBe(miss.count);

    // THE CONTRACT ([P1] param profile): every outcome costs the same sorted multiset
    // of requested memorySize values — so a stopwatch at the prompt cannot distinguish
    // the real PIN from a duress secret or a wrong guess even when a deniability blob
    // sits at legacy params. (Here all blobs are current-param, so the profiles are
    // uniform; the legacy-param case is in unlockTimingLegacyParams.p1.test.jsx.)
    expect(success.profile).toEqual(miss.profile);
    expect(duress.profile).toEqual(miss.profile);
  });
});

// RESIDUAL (honest scope): this test proves KDF-COUNT equality, not wall-clock
// equality directly. Wall-clock equality follows only because every REAL KDF on
// every path derives at the shared KDF_PARAMS (deniabilityUnlock.js chaff blobs carry
// KDF_PARAMS; keyStore.unlock and credentialVerifier both use KDF_PARAMS). Non-KDF
// per-branch work (an extra IndexedDB GET, an AES-GCM tag check) is microseconds
// against ~100 ms+ KDFs — below the measurement floor, but not provably zero. A
// real-device timing-harness measurement remains an audit item.
