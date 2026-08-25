// KDF profile v2 — user-ruled global raise-then-drop from 192 MiB / t=3 (v1) to
// 96 MiB / t=6 (v2), traded against real-device unlock latency. Full rationale
// in vault.js head comment and docs/Feature-Status.md 2026-08-24 entry.
//
// This suite pins the machine contract:
//   (1) KDF_PARAMS is exactly the v2 profile (98304 KiB / t=6 / kdfProfileVersion=2).
//   (2) A blob written under v1 (kdf.memorySize=196608, t=3) still opens tomorrow
//       via paramsFromVault — the backwards-compat safety net.
//   (3) vaultNeedsKdfMigration flags v1 as needing rekey (informational — the flag
//       gates ACTUALLY rekeying).
//   (4) KDF_PROFILE_V2_MIGRATION_ENABLED is now `true` (owner flipped on
//       2026-08-25 after real-device benchmark). The Personal Backup guard in
//       keystore/native.js is what keeps share-holders safe; see
//       vault-kdf-migration-flag-on.test.js for the guard's contract.
//   (5) With the flag ON, vaultNeedsRekey flags a v:2 blob at v1 KDF params
//       for rekey (silent migration) AND still flags a v:1 (no-AAD) blob for
//       the AAD upgrade — which was always independent of the KDF-profile
//       migration flag.
//   (6) Roundtrip: encryptVault stamps kdfProfileVersion=2 into the blob's kdf
//       field, and paramsFromVault ignores that extra field (assertSaneKdfParams
//       only iterates the 4 argon2id-relevant fields).

import { describe, it, expect } from 'vitest';
import {
  KDF_PARAMS,
  KDF_PROFILE_V2_MIGRATION_ENABLED,
  vaultNeedsKdfMigration,
  vaultNeedsRekey,
  encryptVault,
  decryptVault,
} from '../vault.js';

describe('KDF profile v2 (owner-ruled 2026-08-24) — 96 MiB / t=6, migration flag ON (2026-08-25 flip)', () => {
  it('KDF_PARAMS is exactly the v2 profile', () => {
    expect(KDF_PARAMS.memorySize).toBe(98304); // 96 MiB
    expect(KDF_PARAMS.iterations).toBe(6);
    expect(KDF_PARAMS.parallelism).toBe(1);
    expect(KDF_PARAMS.hashLength).toBe(32);
    expect(KDF_PARAMS.kdfProfileVersion).toBe(2);
  });

  it('migration flag is now ON (owner-ruled flip 2026-08-25)', () => {
    // The Personal Backup guard in keystore/native.js `_unlockInner` is what
    // keeps share-holders safe under this flip; changing this expectation back
    // to `false` without also removing that guard would silently disable the
    // guarded migration and leave the doc trail contradicting the code.
    expect(KDF_PROFILE_V2_MIGRATION_ENABLED).toBe(true);
  });

  it('a v1-legacy blob (192 MiB / t=3, no kdfProfileVersion) is flagged as needing migration', () => {
    const v1Blob = {
      v: 2,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
      salt: 'AA==', iv: 'AA==', ct: 'AA==',
    };
    expect(vaultNeedsKdfMigration(v1Blob)).toBe(true);
  });

  it('a v2 blob (96 MiB / t=6) is NOT flagged as needing migration', () => {
    const v2Blob = {
      v: 2,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 6, memorySize: 98304, hashLength: 32, kdfProfileVersion: 2 },
      salt: 'AA==', iv: 'AA==', ct: 'AA==',
    };
    expect(vaultNeedsKdfMigration(v2Blob)).toBe(false);
  });

  it('kek-dek blobs are never flagged for KDF migration (no Argon2id-derived key)', () => {
    const kekDekBlob = { v: 2, kdf: 'kek-dek', iv: 'AA==', ct: 'AA==' };
    expect(vaultNeedsKdfMigration(kekDekBlob)).toBe(false);
  });

  it('flag ON: vaultNeedsRekey DOES flag a v:2/v1-KDF blob (the whole point of the flip)', () => {
    const v1KdfV2Aad = {
      v: 2,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
      salt: 'AA==', iv: 'AA==', ct: 'AA==',
    };
    // Sanity: this is exactly the class of blob the flag now migrates.
    expect(KDF_PROFILE_V2_MIGRATION_ENABLED).toBe(true);
    expect(vaultNeedsRekey(v1KdfV2Aad)).toBe(true);
  });

  it('flag ON: vaultNeedsRekey STILL flags a v:1 (no-AAD) blob — AAD upgrade is independent', () => {
    const v1AadBlob = {
      v: 1,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32 },
      salt: 'AA==', iv: 'AA==', ct: 'AA==',
    };
    // AAD v:1→v:2 rekey is a separate, always-on concern — must not be gated
    // behind the KDF-profile migration flag.
    expect(vaultNeedsRekey(v1AadBlob)).toBe(true);
  });

  it('roundtrip: encryptVault stamps kdfProfileVersion=2, decryptVault reads it back', async () => {
    const secret = 'roundtrip test seed material';
    const blob = await encryptVault(secret, 'a-fresh-strong-password');
    expect(blob.v).toBe(2);
    expect(blob.kdf.memorySize).toBe(98304);
    expect(blob.kdf.iterations).toBe(6);
    expect(blob.kdf.kdfProfileVersion).toBe(2);
    // paramsFromVault must ignore the extra `kdfProfileVersion` field cleanly —
    // decrypt must not throw on the sanity ceiling checks.
    const back = await decryptVault(blob, 'a-fresh-strong-password');
    expect(back).toBe(secret);
  }, 30_000);
});
