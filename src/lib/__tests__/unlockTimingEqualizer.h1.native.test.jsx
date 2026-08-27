// H-1 / M-4 native-surface regression pin.
//
// Issue #2000 noted that PR #1989 disabled the unlock timing equalizers on native
// only, and no test exercised the Capacitor/native surface to catch it. This suite
// mirrors the web H-1 count-parity test but forces WalletProvider down the native
// branch via Capacitor.isNativePlatform() so a future native-only carveout fails here.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

const kdf = vi.hoisted(() => ({ count: 0 }));
vi.mock('hash-wasm', () => ({
  argon2id: async (opts) => {
    kdf.count += 1;
    // The invariant here is call-count parity, not Argon2 correctness. Avoiding
    // real 96 MiB allocations keeps this structural regression test CI-safe.
    const input = opts?.password ?? new Uint8Array();
    let state = 0x811c9dc5;
    for (const byte of input) state = Math.imul(state ^ byte, 0x01000193) >>> 0;
    return Uint8Array.from({ length: opts?.hashLength ?? 32 }, (_, i) =>
      (state >>> ((i % 4) * 8)) & 0xff,
    );
  },
}));

// Keep the verifier out of scope so this test pins the native unlock equalizer only.
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
      const { argon2id } = await import('hash-wasm');
      await argon2id({
        password: new TextEncoder().encode(String(password)),
        salt: new Uint8Array(16),
        parallelism: 1,
        iterations: 1,
        memorySize: 1024,
        hashLength: 32,
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

import { setDuressVault, clearDuressVault } from '@/wallet-core/duress';
import { clearPanicVault } from '@/wallet-core/panic';
import { wipeStealthPool, ensureStealthPool } from '@/wallet-core/stealth';
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

async function countUnlockKdfs(password, { expectThrow = false } = {}) {
  kdf.count = 0;
  let threw = false;
  await act(async () => {
    try {
      await ctx.unlock(password);
    } catch {
      threw = true;
    }
  });
  if (expectThrow) expect(threw).toBe(true); else expect(threw).toBe(false);
  return kdf.count;
}

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  // This suite exercises the timing equalizer, not the new fresh-native
  // biometric default. Keep the app-layer prompt out of its unlock scenarios.
  try { localStorage.setItem('veyrnox-biometric-unlock', '0'); } catch { /* shimmed */ }
  await resetDevice();
});

afterEach(() => {
  cleanup();
});

describe('H-1 native surface — unlock() keeps KDF-count parity on Capacitor', () => {
  it('primary success, duress hit, and total miss spend the same KDF count on native', async () => {
    const DURESS_PW = 'duress-secret-9999';
    await setDuressVault(DECOY_MNEMONIC, DURESS_PW);
    await ensureStealthPool();

    await renderProvider();

    const success = await countUnlockKdfs(PRIMARY_PW);
    expect(ctx.isDecoy).toBe(false);

    const duress = await countUnlockKdfs(DURESS_PW);
    expect(ctx.isDecoy).toBe(true);

    const miss = await countUnlockKdfs('totally-wrong-guess-0000', { expectThrow: true });

    expect(success).toBe(miss);
    expect(duress).toBe(miss);
  });
});
