// [P1] H-1 residual — LEGACY-PARAM installed-base timing oracle (param-profile, not count).
//
// The first-pass H-1 fix equalized the KDF *count* every unlock outcome spends (5):
// the primary-success path calls spendPrimaryUnlockEqualizerKdfs, which mirrors the
// failure path's 3 deniability KDFs. But the equalizer spends its 3 dummies via
// chaffBlob(), which stamps the CURRENT KDF_PARAMS (192 MiB). The real duress/panic/
// hidden slots inside resolveDeniabilityUnlock decrypt each stored blob at that blob's
// OWN recorded params (M3 migration — decryptVault uses paramsFromVault).
//
// So for an INSTALLED-BASE vault whose duress blob was written under LEGACY params
// (64 MiB, pre-2026-07-05) and not yet migrated:
//   - a total-miss / duress-hit spends the real duress slot at 64 MiB (cheap) + the
//     other slots at 192 MiB;
//   - a primary-success spends 3 dummies ALL at 192 MiB.
// KDF *count* is equal (5), but the *param profile* (hence wall-clock) is NOT — the
// primary-success path is measurably SLOWER, an opposite-direction timing oracle for
// exactly the users who have deniability configured.
//
// This test does NOT trust the static claim. It wraps hash-wasm's argon2id (the single
// KDF primitive every vault decrypt / verifier derivation funnels through), records the
// REQUESTED memorySize of every call (what an attacker's stopwatch reflects), and drives
// the ACTUAL WalletProvider.unlock() flow for three outcomes. The contract: the sorted
// memorySize MULTISET must be identical across (a) primary success, (b) duress hit, and
// (c) total miss. A difference is the oracle.
//
// SPEED: the mock records the REQUESTED memorySize truthfully but runs orig.argon2id at
// a cheap fixed cost, so the test measures the param PROFILE (the security-relevant
// quantity) without paying real 64/192 MiB derivations. Round-trips still hold because
// encrypt and decrypt of the same blob both take the same cheap override.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// Hoisted KDF recorder shared with the hash-wasm mock factory (both hoisted).
const kdf = vi.hoisted(() => ({ memorySizes: [], recording: false }));
vi.mock('hash-wasm', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    argon2id: (opts, ...rest) => {
      // Record the REQUESTED memorySize (the attacker-relevant cost) only while a
      // measured unlock is in flight, then run the real KDF at a CHEAP fixed cost so
      // the suite stays fast. The recorded value is the true request, not the override.
      if (kdf.recording) kdf.memorySizes.push(opts && opts.memorySize);
      return orig.argon2id({ ...opts, memorySize: 256 }, ...rest);
    },
  };
});

const PRIMARY_PW = 'correct-horse-battery-staple-pin';
const PRIMARY_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const DECOY_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';
const DURESS_PW = 'duress-secret-9999';

// The primary vault derives at the CURRENT params (a migrated installed-base primary);
// the DURESS blob below is deliberately left at LEGACY params to reproduce the defect.
vi.mock('@/wallet-core/keystore', () => {
  const PRIMARY = 'correct-horse-battery-staple-pin';
  const MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const ks = {
    async hasVault() { return true; },
    async hasVaultKekWrap() { return false; },
    async unlock(password) {
      // Model the real keystore's single Argon2id derive at the CURRENT params so the
      // primary-unlock KDF is recorded at KDF_PARAMS.memorySize on every outcome.
      const { argon2id } = await import('hash-wasm');
      const { KDF_PARAMS } = await import('@/wallet-core/vault.js');
      await argon2id({
        password: new TextEncoder().encode(String(password)),
        salt: new Uint8Array(16),
        parallelism: 1, iterations: 3, memorySize: KDF_PARAMS.memorySize, hashLength: 32,
        outputType: 'binary',
      });
      if (password === PRIMARY) return MNEMONIC;
      throw new Error('wrong password');
    },
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

import { KDF_PARAMS } from '@/wallet-core/vault.js';
import { clearDuressVault } from '@/wallet-core/duress';
import { clearPanicVault } from '@/wallet-core/panic';
import { wipeStealthPool, ensureStealthPool } from '@/wallet-core/stealth';
import { makeContainer, serializeContainer, newWalletId } from '@/wallet-core/multiVault';
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

const LEGACY_MEMORY = 65536;    // 64 MiB — the pre-2026-07-05 at-rest default
const CURRENT_MEMORY = KDF_PARAMS.memorySize; // 192 MiB
const DECOY_KEY = 'secondary';  // duress.js stores the decoy under this key
const DB_NAME = 'veyrnox-vault';
const STORE = 'vault';

function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }

// Build a duress decoy blob whose recorded kdf params are LEGACY (64 MiB), mirroring
// how duress.js/encryptVault writes a blob but stamping the OLD params — i.e. an
// installed-base decoy written before the 64→192 MiB raise and not yet migrated.
async function encryptVaultAtParams(secret, password, memorySize) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { argon2id } = await import('hash-wasm'); // mocked wrapper (records + runs cheap)
  const raw = await argon2id({
    password: encoder.encode(password.normalize('NFKC')),
    salt, parallelism: 1, iterations: 3, memorySize, hashLength: 32,
    outputType: 'binary',
  });
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(secret));
  return {
    v: 1,
    kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize, hashLength: 32 },
    salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ctBuf)),
  };
}

function putRaw(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      r.onsuccess = () => { db.close(); resolve(); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

// Store a LEGACY-param duress decoy (64 MiB), exactly the installed-base scenario.
async function setLegacyDuressVault(decoyMnemonic, duressPassword) {
  const container = makeContainer([{ id: newWalletId(), mnemonic: decoyMnemonic }]);
  const blob = await encryptVaultAtParams(serializeContainer(container), duressPassword, LEGACY_MEMORY);
  await putRaw(DECOY_KEY, blob);
}

let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => {
    render(<WalletProvider><Capture /></WalletProvider>);
  });
}

async function resetDevice() {
  await wipeStealthPool();
  await clearDuressVault();
  await clearPanicVault();
}

// Drive one unlock() and return the SORTED multiset of requested memorySizes spent
// during it — the wall-clock cost profile an attacker with a stopwatch measures.
async function unlockMemoryProfile(password, { expectThrow = false } = {}) {
  kdf.memorySizes = [];
  kdf.recording = true;
  let threw = false;
  await act(async () => {
    try { await ctx.unlock(password); } catch { threw = true; }
  });
  kdf.recording = false;
  if (expectThrow) expect(threw).toBe(true); else expect(threw).toBe(false);
  return [...kdf.memorySizes].sort((a, b) => a - b);
}

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  await resetDevice();
});
afterEach(() => { cleanup(); });

describe('[P1] H-1 — unlock() spends an identical KDF PARAM-PROFILE on success, duress, and miss', () => {
  it('legacy-param duress vault: success / duress-hit / total-miss memorySize multisets are identical', async () => {
    // Installed-base scenario: primary migrated to 192 MiB, duress decoy STILL at 64 MiB.
    await setLegacyDuressVault(DECOY_MNEMONIC, DURESS_PW);
    await ensureStealthPool(); // chaff seeded at CURRENT params, as in the real flow

    await renderProvider();

    const successProfile = await unlockMemoryProfile(PRIMARY_PW);
    expect(ctx.isDecoy).toBe(false);

    const duressProfile = await unlockMemoryProfile(DURESS_PW);
    expect(ctx.isDecoy).toBe(true);

    const missProfile = await unlockMemoryProfile('totally-wrong-guess-0000', { expectThrow: true });

    // RED EVIDENCE — surfaced in the failure message. Under the current code:
    //   success   = [192,192,192,192,192]  (equalizer dummies all at CURRENT params)
    //   duressHit = [64,192,192,192,192]   (real duress slot at LEGACY 64 MiB)
    //   miss      = [64,192,192,192,192]
    // The 64 MiB entry present in duress/miss but absent from success is the oracle.
    const observed = {
      success: successProfile.join(','),
      duressHit: duressProfile.join(','),
      miss: missProfile.join(','),
      legacy: LEGACY_MEMORY, current: CURRENT_MEMORY,
    };

    // Sanity: the failure path really did touch the LEGACY-param slot (otherwise the
    // scenario is not reproduced and the test would pass vacuously — I4 honesty).
    expect(missProfile).toContain(LEGACY_MEMORY);
    // Sanity: the count-only equalizer already holds — same NUMBER of KDFs everywhere.
    expect(successProfile).toHaveLength(missProfile.length);

    // THE CONTRACT: wall-clock parity requires the param PROFILE — not merely the
    // count — to match across every outcome. `observed` is referenced so its RED
    // evidence prints alongside a failure.
    void observed;
    expect(successProfile).toEqual(missProfile);
    expect(duressProfile).toEqual(missProfile);
  });
});
