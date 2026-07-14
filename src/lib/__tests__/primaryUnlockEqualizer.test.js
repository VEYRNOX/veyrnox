// H-1 primary-unlock equalizer — SUPERSEDED STRATEGY.
//
// This file previously asserted a two-sided wall-clock bound on the magic constant
// PRIMARY_UNLOCK_EQUALIZER_MS (a setTimeout pad on the primary-success path). That
// approach was REPLACED: a hand-tuned sleep only covered ~1.4 of the 3-KDF deficit
// between a primary success and any failure/duress outcome (leaving the fast path
// measurably faster — the H-1 oracle), and the constant drifted whenever KDF_PARAMS
// changed (the VU-06 regression history).
//
// The fix is now STRUCTURAL: WalletProvider.unlock()'s primary-success path calls
// spendPrimaryUnlockEqualizerKdfs (wallet-core/deniabilityUnlock.js), which spends the
// SAME constant number of Argon2id KDFs that resolveDeniabilityUnlock spends on the
// failure path. So the invariant to pin is a KDF COUNT (which auto-tracks KDF_PARAMS),
// not a millisecond bound. The end-to-end per-outcome equality is measured in
// unlockTimingEqualizer.h1.test.jsx; here we unit-pin the helper's count against the
// resolver's count so the two can never silently drift apart.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Count real Argon2id invocations by wrapping hash-wasm's argon2id (the single KDF
// primitive both the equalizer and the resolver funnel through).
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

import {
  spendPrimaryUnlockEqualizerKdfs,
  resolveDeniabilityUnlock,
} from '../../wallet-core/deniabilityUnlock.js';
import { KDF_PARAMS } from '../../wallet-core/vault.js';
import { wipeStealthPool, ensureStealthPool } from '../../wallet-core/stealth.js';
import { clearDuressVault } from '../../wallet-core/duress.js';
import { clearPanicVault } from '../../wallet-core/panic.js';

describe('H-1 — primary-success equalizer spends the same KDF count as the failure path', () => {
  beforeEach(async () => {
    try { localStorage.clear(); } catch { /* shimmed */ }
    await wipeStealthPool();
    await clearDuressVault();
    await clearPanicVault();
  });

  it('spendPrimaryUnlockEqualizerKdfs runs exactly 3 KDFs (matching resolveDeniabilityUnlock)', async () => {
    await ensureStealthPool();
    // Baseline: the failure-path resolver's constant KDF count on a wrong guess.
    kdf.count = 0;
    await resolveDeniabilityUnlock('a-wrong-guess-for-the-count');
    const resolverKdfs = kdf.count;

    // The primary-success equalizer must spend the SAME count so unlock latency is
    // equal across outcomes (no faster fast-path, no over-padded slower fast-path).
    kdf.count = 0;
    await spendPrimaryUnlockEqualizerKdfs('any-password');
    const equalizerKdfs = kdf.count;

    expect(equalizerKdfs).toBe(resolverKdfs);
    expect(equalizerKdfs).toBe(3); // pins the current constant explicitly
  });

  it('every equalizer KDF derives at the current KDF_PARAMS.memorySize', async () => {
    // A dummy pad at stale params would cost differently than a real attempt and
    // reintroduce a timing tell. Assert the memorySize each call passes to argon2id.
    kdf.count = 0;
    kdf.memorySizes = [];
    await spendPrimaryUnlockEqualizerKdfs('any-password');

    expect(kdf.memorySizes).toHaveLength(3);
    for (const m of kdf.memorySizes) expect(m).toBe(KDF_PARAMS.memorySize);
  });
});
