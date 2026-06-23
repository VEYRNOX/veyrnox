// Guards against B-1 / B-2 (security-defect audit 2026-06-23): a vault blob records
// its own Argon2id KDF params (M3 migration), and on the BACKUP-IMPORT path those
// params are attacker-controlled. argon2id allocates `memorySize` KiB BEFORE the
// AES-GCM tag is checked, so an unbounded value is a pre-authentication
// resource-exhaustion (OOM) vector. These tests pin a sane ceiling/floor.
//
// NOTE: the pure `assertSaneKdfParams` tests below intentionally NEVER call argon2id,
// so a pre-fix red run cannot OOM. The decryptVault integration test is added once the
// guard exists (it then throws BEFORE deriveKey, so it is also OOM-safe).

import { describe, it, expect } from 'vitest';
import { assertSaneKdfParams, KDF_PARAMS, decryptVault } from '../vault.js';

describe('assertSaneKdfParams — KDF param bounds (param-guard)', () => {
  it('accepts the CURRENT KDF params', () => {
    expect(() => assertSaneKdfParams({ ...KDF_PARAMS })).not.toThrow();
  });

  it('accepts LEGACY-style 64 MiB params (M3 migration path)', () => {
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32 })).not.toThrow();
  });

  it('REJECTS an oversized memorySize (the OOM vector)', () => {
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: 3, memorySize: 0xFFFFFFFF, hashLength: 32 }))
      .toThrow(/out of range/i);
  });

  it('REJECTS oversized iterations', () => {
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: 0xFFFFFFFF, memorySize: 196608, hashLength: 32 }))
      .toThrow(/out of range/i);
  });

  it('REJECTS oversized parallelism', () => {
    expect(() => assertSaneKdfParams({ parallelism: 1024, iterations: 3, memorySize: 196608, hashLength: 32 }))
      .toThrow(/out of range/i);
  });

  it('REJECTS non-integer / NaN / negative params', () => {
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: 3, memorySize: Number.NaN, hashLength: 32 })).toThrow();
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: 3, memorySize: 196608.5, hashLength: 32 })).toThrow();
    expect(() => assertSaneKdfParams({ parallelism: 1, iterations: -3, memorySize: 196608, hashLength: 32 })).toThrow();
  });
});

describe('decryptVault — rejects a crafted blob BEFORE argon2id (B-1 integration)', () => {
  it('throws out-of-range (not OOM) for an oversized memorySize blob', async () => {
    // A well-formed-looking blob whose recorded KDF memorySize is the OOM payload.
    // The guard in paramsFromVault must throw before deriveKey() ever calls argon2id.
    const malicious = {
      v: 1, salt: btoa('saltsalt'), iv: btoa('iv'), ct: btoa('ct'),
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 0xFFFFFFFF, hashLength: 32 },
    };
    await expect(decryptVault(malicious, 'whatever')).rejects.toThrow(/out of range/i);
  });
});
