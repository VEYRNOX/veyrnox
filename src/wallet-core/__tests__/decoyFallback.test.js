import { describe, it, expect, beforeEach, vi } from 'vitest';

// Wrap hash-wasm's argon2id so we can assert the fallback is MEMORY-HARD (real
// Argon2id at the shared params), not a cheap hash. Calls through to the real impl.
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

import { deriveDeterministicDecoyMnemonic, getOrCreateDeviceSalt } from '../decoyFallback.js';
import { KDF_PARAMS } from '../vault.js';
import { validateMnemonic } from '../mnemonic.js';

const SALT_KEY = 'veyrnox-pin-decoy-salt';

describe('decoyFallback — deterministic, memory-hard decoy derivation', () => {
  beforeEach(() => {
    localStorage.clear();
    kdf.count = 0;
    kdf.memorySizes = [];
  });

  it('derives a deterministic, valid BIP-39 wallet from (pin, salt)', async () => {
    const salt = getOrCreateDeviceSalt();
    const a = await deriveDeterministicDecoyMnemonic('123456', salt);
    const b = await deriveDeterministicDecoyMnemonic('123456', salt);
    expect(a).toBe(b);                    // same pin+salt => same wallet
    expect(validateMnemonic(a)).toBe(true);
  });

  it('different PINs derive different wallets', async () => {
    const salt = getOrCreateDeviceSalt();
    const a = await deriveDeterministicDecoyMnemonic('123456', salt);
    const c = await deriveDeterministicDecoyMnemonic('654321', salt);
    expect(a).not.toBe(c);
  });

  it('uses Argon2id at the shared KDF_PARAMS (memory-hard, NOT a cheap hash)', async () => {
    const salt = getOrCreateDeviceSalt();
    kdf.count = 0; kdf.memorySizes = [];
    await deriveDeterministicDecoyMnemonic('123456', salt);
    expect(kdf.count).toBe(1);                                  // exactly one KDF
    expect(kdf.memorySizes[0]).toBe(KDF_PARAMS.memorySize);     // same cost as a real attempt
  });

  it('getOrCreateDeviceSalt is stable across calls and persisted', () => {
    const s1 = getOrCreateDeviceSalt();
    const s2 = getOrCreateDeviceSalt();
    expect(Array.from(s1)).toEqual(Array.from(s2));
    expect(localStorage.getItem(SALT_KEY)).toBeTruthy();
    expect(s1.length).toBe(16);
  });
});
