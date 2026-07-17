// vault-aad-canonical.test.js
//
// Issue #1110 — vaultAad relies on unspecified JS object-property insertion order
// via JSON.stringify. Today the fields happen to iterate in {v,kdf,salt} order and
// the kdf object in {name,parallelism,iterations,memorySize,hashLength} order —
// but that's an accident of the current object-literal shape, not a specification.
//
// If a refactor ever re-shapes `KDF_PARAMS` or the blob literal, the AAD bytes
// change silently and every stored v:2 vault fails to decrypt as "wrong password
// or corrupted vault" — a full user lockout with no diagnostic.
//
// Fix (option b from the task brief): a canonical serializer with an explicit
// field-order tuple. The output MUST byte-match the current
// JSON.stringify({ v, kdf, salt }) form so existing v:2 blobs on disk keep
// decrypting without any migration.
//
// TDD:
//   RED-1 — golden vector: `vaultAad({v:2, kdf:{name:'argon2id',parallelism:1,
//           iterations:3, memorySize:196608, hashLength:32}, salt:'abc='})` MUST
//           equal `{"v":2,"kdf":{"name":"argon2id","parallelism":1,"iterations":3,
//           "memorySize":196608,"hashLength":32},"salt":"abc="}` bytes.
//   RED-2 — refactor safety: if the caller builds the kdf object with a DIFFERENT
//           insertion order (memorySize before parallelism, hashLength before name,
//           etc.), the AAD MUST be identical. Today's JSON.stringify path fails
//           this — the whole point of the fix.
//   RED-3 — kek-dek shape (no salt) golden vector.
//   RED-4 — decrypt round-trip of an existing v:2 blob is preserved (no lockout).

import { describe, it, expect } from 'vitest';
import {
  encryptVault,
  decryptVault,
  encryptVaultWithDek,
  decryptVaultWithDek,
  __vaultAad_forTest,
  KDF_PARAMS,
} from '../vault.js';

const dec = new TextDecoder();

describe('#1110 — vaultAad canonical serialization', () => {
  it('golden vector: argon2id blob AAD equals the current JSON.stringify bytes', () => {
    const blob = {
      v: 2,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    };
    const expected = '{"v":2,"kdf":{"name":"argon2id","parallelism":1,"iterations":3,"memorySize":196608,"hashLength":32},"salt":"AAAAAAAAAAAAAAAAAAAAAA=="}';
    const aad = __vaultAad_forTest(blob);
    expect(dec.decode(aad)).toBe(expected);
  });

  it('refactor safety: reordered KDF object insertion order produces identical AAD', () => {
    const canonical = {
      v: 2,
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
      salt: 'salt-b64==',
    };
    // Same fields, DIFFERENT insertion order in both the outer blob and the kdf.
    const shuffled = {
      salt: 'salt-b64==',
      kdf: { hashLength: 32, memorySize: 196608, iterations: 3, parallelism: 1, name: 'argon2id' },
      v: 2,
    };
    const a = dec.decode(__vaultAad_forTest(canonical));
    const b = dec.decode(__vaultAad_forTest(shuffled));
    expect(a).toBe(b);
  });

  it('golden vector: kek-dek blob AAD (no salt field) equals current bytes', () => {
    const blob = { v: 2, kdf: 'kek-dek', iv: 'anything' };
    expect(dec.decode(__vaultAad_forTest(blob))).toBe('{"v":2,"kdf":"kek-dek"}');
  });

  it('kek-dek AAD ignores a stale spread `salt` (matches Codex P1 #1 behaviour)', () => {
    // encryptVaultWithDek seals AAD off a salt-free stub, but decryptVaultWithDek
    // receives the full saved blob (which retains a stale `salt` from a prior
    // Argon2id wrap). The canonical serializer must exclude salt when kdf === 'kek-dek'
    // or every KEK-enrolled unlock hits an auth-tag mismatch.
    const withStaleSalt = { v: 2, kdf: 'kek-dek', salt: 'STALE==', iv: 'x' };
    expect(dec.decode(__vaultAad_forTest(withStaleSalt))).toBe('{"v":2,"kdf":"kek-dek"}');
  });

  it('backward-compat: existing v:2 argon2id blob round-trips (no lockout)', async () => {
    const secret = 'canary phrase for canonicalisation';
    const blob = await encryptVault(secret, 'pw12345678');
    expect(blob.v).toBe(2);
    const out = await decryptVault(blob, 'pw12345678');
    expect(out).toBe(secret);
  });

  it('backward-compat: existing v:2 kek-dek blob round-trips', async () => {
    const secret = 'dek-wrapped canary';
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const blob = await encryptVaultWithDek(secret, dek);
    expect(blob.v).toBe(2);
    const out = await decryptVaultWithDek(blob, dek);
    expect(out).toBe(secret);
  });

  it('KDF_PARAMS insertion order is not exploited by the AAD serializer', () => {
    // If someone refactors KDF_PARAMS to declare fields in a different order,
    // the AAD must NOT change. This test exists to make that class of refactor
    // safe. If it fails, the canonical serializer regressed to insertion-order.
    const declared = { name: 'argon2id', ...KDF_PARAMS };
    const reordered = {
      hashLength: KDF_PARAMS.hashLength,
      name: 'argon2id',
      memorySize: KDF_PARAMS.memorySize,
      iterations: KDF_PARAMS.iterations,
      parallelism: KDF_PARAMS.parallelism,
    };
    const a = dec.decode(__vaultAad_forTest({ v: 2, kdf: declared, salt: 's' }));
    const b = dec.decode(__vaultAad_forTest({ v: 2, kdf: reordered, salt: 's' }));
    expect(a).toBe(b);
  });
});
