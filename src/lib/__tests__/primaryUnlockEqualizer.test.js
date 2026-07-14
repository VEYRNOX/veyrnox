// H-1 primary-unlock equalizer — SUPERSEDED STRATEGY.
//
// This file previously asserted a two-sided wall-clock bound on the magic constant
// PRIMARY_UNLOCK_EQUALIZER_MS (a setTimeout pad on the primary-success path). That
// approach was REPLACED: a hand-tuned sleep only covered ~1.4 of the KDF deficit
// between a primary success and any failure/duress outcome (leaving the fast path
// measurably faster — the H-1 oracle), and the constant drifted whenever KDF_PARAMS
// changed (the VU-06 regression history).
//
// The fix is now STRUCTURAL: WalletProvider.unlock()'s primary-success path calls
// spendPrimaryUnlockEqualizerKdfs (wallet-core/deniabilityUnlock.js), which runs the
// SAME resolveDeniabilityUnlock the failure path runs and discards the result. So the
// invariant to pin is not merely a KDF COUNT but the full KDF PARAM PROFILE (the sorted
// multiset of requested memorySize values) — because [P1] showed a count-only equalizer
// (3 dummies at the CURRENT KDF_PARAMS) still leaked a timing oracle on installed-base
// vaults whose deniability blob(s) sit at LEGACY params (64 MiB): the failure path
// decrypts those cheaply (each blob's own recorded params — M3) while the old padding
// spent the current 192 MiB. Here we unit-pin the equalizer's profile against the
// resolver's profile — for BOTH a current-param and a legacy-param configuration — so the
// two can never silently drift apart. End-to-end per-outcome equality is measured in
// unlockTimingEqualizer.h1.test.jsx and unlockTimingLegacyParams.p1.test.jsx.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Count real Argon2id invocations by wrapping hash-wasm's argon2id (the single KDF
// primitive both the equalizer and the resolver funnel through). Records the REQUESTED
// memorySize; runs the real KDF at a CHEAP fixed cost so legacy/current-param round-trips
// stay fast (the recorded value is the true request, the security-relevant quantity).
const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [] }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      kdf.count += 1;
      kdf.memorySizes.push(opts && opts.memorySize);
      return orig.argon2id({ ...opts, memorySize: 256 }, ...rest);
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
import { makeContainer, serializeContainer, newWalletId } from '../../wallet-core/multiVault.js';

const LEGACY_MEMORY = 65536; // 64 MiB — the pre-2026-07-05 at-rest default
const DECOY_KEY = 'secondary';
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';
const DECOY_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function sorted(a) { return [...a].sort((x, y) => x - y); }

// Build + persist a LEGACY-param (64 MiB) duress decoy directly under 'secondary',
// reproducing an installed-base vault written before the 64→192 MiB raise.
async function setLegacyDuressVault(mnemonic, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { argon2id } = await import('hash-wasm');
  const raw = await argon2id({
    password: enc.encode(password.normalize('NFKC')),
    salt, parallelism: 1, iterations: 3, memorySize: LEGACY_MEMORY, hashLength: 32,
    outputType: 'binary',
  });
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const container = serializeContainer(makeContainer([{ id: newWalletId(), mnemonic }]));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(container));
  const blob = {
    v: 1,
    kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: LEGACY_MEMORY, hashLength: 32 },
    salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ctBuf)),
  };
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, DECOY_KEY);
      r.onsuccess = () => { db.close(); resolve(); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

describe('H-1 — primary-success equalizer spends the same KDF count AND param profile as the failure path', () => {
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

  it('no legacy blobs: equalizer memorySize PROFILE equals the resolver profile (all current params)', async () => {
    await ensureStealthPool();
    kdf.memorySizes = [];
    await resolveDeniabilityUnlock('a-wrong-guess');
    const resolverProfile = sorted(kdf.memorySizes);

    kdf.memorySizes = [];
    await spendPrimaryUnlockEqualizerKdfs('any-password');
    const equalizerProfile = sorted(kdf.memorySizes);

    // Same multiset as the failure path — and, with nothing legacy configured, every
    // entry is the current param (the baseline the old count-only equalizer also met).
    expect(equalizerProfile).toEqual(resolverProfile);
    expect(equalizerProfile).toEqual([KDF_PARAMS.memorySize, KDF_PARAMS.memorySize, KDF_PARAMS.memorySize]);
  });

  it('[P1] LEGACY-param duress vault: equalizer PROFILE still equals the resolver profile', async () => {
    // The exact regression a count-only equalizer (3 dummies at CURRENT params) fails:
    // the resolver decrypts the legacy duress slot at 64 MiB, so its profile carries a
    // 65536 entry; the equalizer MUST carry the same, or the primary-success path is a
    // measurably-slower opposite-direction oracle for deniability users.
    await setLegacyDuressVault(DECOY_MNEMONIC, 'the-duress-pw');
    await ensureStealthPool();

    kdf.memorySizes = [];
    await resolveDeniabilityUnlock('a-wrong-guess');
    const resolverProfile = sorted(kdf.memorySizes);

    kdf.memorySizes = [];
    await spendPrimaryUnlockEqualizerKdfs('any-password');
    const equalizerProfile = sorted(kdf.memorySizes);

    // The resolver really touched the legacy slot (scenario is reproduced — not vacuous).
    expect(resolverProfile).toContain(LEGACY_MEMORY);
    // Param-profile parity: the equalizer spends the SAME legacy-cheap + current mix.
    expect(equalizerProfile).toEqual(resolverProfile);
  });
});
