// H-1 v2-profile native-surface pin (2026-08-24 KDF-profile migration).
//
// KDF_PARAMS was globally lowered from v1 (192 MiB / t=3) to v2 (96 MiB / t=6) —
// see vault.js head comment + docs/Feature-Status.md 2026-08-24 entry for the
// user-ruled tradeoff. This suite mirrors unlockTimingEqualizer.h1.native's
// KDF-count parity contract on the v2 profile AND additionally pins that every
// real Argon2id derivation on the unlock hot path (chaff / resolver / verifier)
// runs at the v2 memorySize — so a stopwatch cannot distinguish success / duress
// / miss on either the count OR the per-KDF cost dimension under the new profile.
//
// Why no wall-clock "target constant": the H-1 equalizer is structural (the
// primary-success path runs the same resolveDeniabilityUnlock the failure path
// runs and discards the result — spendPrimaryUnlockEqualizerKdfs). There is no
// PRIMARY_UNLOCK_EQUALIZER_MS to tune against a device-class range any more;
// wall-clock parity holds by construction because both paths execute the same
// KDF workload against the same stored blobs. The v2 profile therefore needs
// only a profile-multiset pin, not a milliseconds-target constant.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

const kdf = vi.hoisted(() => ({ count: 0, memorySizes: [] }));
vi.mock('hash-wasm', () => ({
  argon2id: async (opts) => {
    kdf.count += 1;
    kdf.memorySizes.push(opts && opts.memorySize);
    // This suite asserts requested profile parity, not Argon2 correctness.
    const input = opts?.password ?? new Uint8Array();
    let state = 0x811c9dc5;
    for (const byte of input) state = Math.imul(state ^ byte, 0x01000193) >>> 0;
    return Uint8Array.from({ length: opts?.hashLength ?? 32 }, (_, i) =>
      (state >>> ((i % 4) * 8)) & 0xff,
    );
  },
}));

vi.mock('@/wallet-core/credentialVerifier', () => ({
  captureVerifierSafe: vi.fn(async () => null),
  verifyCredential: vi.fn(async () => false),
  verifyCredentialDetailed: vi.fn(async () => ({ ok: false, reason: 'mocked' })),
  createCredentialVerifier: vi.fn(async () => null),
}));

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
      // Model the real keystore's single Argon2id derive at the v2 profile so
      // the primary-unlock KDF cost is recorded at KDF_PARAMS.memorySize on
      // every outcome (matches unlockTimingLegacyParams.p1.test.jsx shape).
      const { argon2id } = await import('hash-wasm');
      const { KDF_PARAMS } = await import('@/wallet-core/vault.js');
      await argon2id({
        password: new TextEncoder().encode(String(password)),
        salt: new Uint8Array(16),
        parallelism: KDF_PARAMS.parallelism,
        iterations: KDF_PARAMS.iterations,
        memorySize: KDF_PARAMS.memorySize,
        hashLength: KDF_PARAMS.hashLength,
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
import { setDuressVault, clearDuressVault } from '@/wallet-core/duress';
import { clearPanicVault } from '@/wallet-core/panic';
import { wipeStealthPool, ensureStealthPool } from '@/wallet-core/stealth';
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

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
async function measureUnlock(password, { expectThrow = false } = {}) {
  kdf.count = 0;
  kdf.memorySizes = [];
  let threw = false;
  await act(async () => {
    try { await ctx.unlock(password); } catch { threw = true; }
  });
  if (expectThrow) expect(threw).toBe(true); else expect(threw).toBe(false);
  return { count: kdf.count, profile: [...kdf.memorySizes].sort((a, b) => a - b) };
}

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  // Keep this KDF-profile test focused on timing work, not the native prompt.
  try { localStorage.setItem('veyrnox-biometric-unlock', '0'); } catch { /* shimmed */ }
  await resetDevice();
});
afterEach(() => { cleanup(); });

describe('H-1 v2 profile — native unlock() preserves count + memorySize parity at 96 MiB', () => {
  it('KDF_PARAMS.memorySize resolves to the v2 target (98304 KiB)', () => {
    expect(KDF_PARAMS.memorySize).toBe(98304);
    expect(KDF_PARAMS.iterations).toBe(6);
  });

  it('success / duress / miss are KDF-count AND memorySize-profile equal on the v2 profile', async () => {
    const DURESS_PW = 'duress-secret-9999';
    await setDuressVault(DECOY_MNEMONIC, DURESS_PW);
    await ensureStealthPool();

    await renderProvider();

    const success = await measureUnlock(PRIMARY_PW);
    expect(ctx.isDecoy).toBe(false);

    const duress = await measureUnlock(DURESS_PW);
    expect(ctx.isDecoy).toBe(true);

    const miss = await measureUnlock('totally-wrong-guess-0000', { expectThrow: true });

    // Count parity (existing H-1 invariant, preserved on the v2 profile).
    expect(success.count).toBe(miss.count);
    expect(duress.count).toBe(miss.count);
    // Memorysize-profile parity (existing [P1] invariant, preserved on v2).
    expect(success.profile).toEqual(miss.profile);
    expect(duress.profile).toEqual(miss.profile);
    // Every recorded KDF on the hot path is at the v2 memorySize — no v1-legacy
    // 196608 residue and no ceiling-1GiB outliers on a fresh (v2-only) device.
    for (const m of miss.profile) expect(m).toBe(KDF_PARAMS.memorySize);
  });
});
