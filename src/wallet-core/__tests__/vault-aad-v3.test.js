// src/wallet-core/__tests__/vault-aad-v3.test.js
//
// Phase 0a — AAD v:3 for kek-dek blobs (#1111 / docs/vault-aad-v3-plan.md).
// The reader is always active; the writer is gated on
// AAD_V3_MIGRATION_ENABLED. This file pins:
//
//   1. `vaultAad` for a v:3 kek-dek blob binds kekWrap/kekSalt/
//      hardwareKekVersion — the fields the v:2 residual left
//      unauthenticated (#1111).
//   2. Field order in the v:3 AAD is canonical (kekWrap sub-object
//      too), so an attacker cannot induce an AAD mismatch by shuffling
//      property insertion order.
//   3. `encryptVaultWithDekV3` round-trips through
//      `decryptVaultWithDek` — the reader auto-selects the v:3 AAD
//      path via `blob.v`, no caller change.
//   4. Field-swap attacks flip decrypt to fail: mutating kekWrap,
//      kekSalt, or hardwareKekVersion on a v:3 blob throws.
//   5. The writer's structural invariants: v:3 write with an
//      incomplete binding throws `VAULT_MALFORMED` fail-closed rather
//      than emitting a blob whose AAD includes `undefined`.
//   6. The feature flag defaults OFF so no production write path
//      accidentally trips v:3 without Phase 0b's explicit wiring.

import { describe, it, expect } from 'vitest';

import {
  vaultAad,
  encryptVaultWithDekV3,
  decryptVaultWithDek,
  VAULT_VERSION_V3,
  AAD_V3_MIGRATION_ENABLED,
  VAULT_ERR,
} from '../vault.js';

const dec = new TextDecoder();

function randomDek() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

const kekWrap = { v: 2, iv: 'd3JhcElWMTIzNDU=', ct: 'd3JhcENUMTIzNDU=' };
const kekSalt = 'a2VrU2FsdEIzMg==';
const hardwareKekVersion = 3;

const binding = () => ({ kekWrap: { ...kekWrap }, kekSalt, hardwareKekVersion });

const canonicalV3Aad = JSON.stringify({
  v: VAULT_VERSION_V3,
  kdf: 'kek-dek',
  kekWrap,
  kekSalt,
  hardwareKekVersion,
});

describe('vault v:3 — constants + flag', () => {
  it('exports VAULT_VERSION_V3 = 3', () => {
    expect(VAULT_VERSION_V3).toBe(3);
  });

  it('AAD_V3_MIGRATION_ENABLED defaults to false', () => {
    // Any accidental flip to true in this commit would silently activate
    // the migration writer without the Phase 0b wiring — fail here
    // rather than in production.
    expect(AAD_V3_MIGRATION_ENABLED).toBe(false);
  });
});

describe('vault v:3 — vaultAad shape', () => {
  it('binds kekWrap, kekSalt, hardwareKekVersion for a v:3 kek-dek blob', () => {
    const blob = {
      v: VAULT_VERSION_V3, kdf: 'kek-dek',
      iv: 'ignored', ct: 'ignored',
      kekWrap, kekSalt, hardwareKekVersion,
    };
    expect(dec.decode(vaultAad(blob))).toBe(canonicalV3Aad);
  });

  it('canonicalizes v:3 field order regardless of blob property insertion order', () => {
    // Reverse the caller's insertion order and verify byte-identical AAD.
    const blob = {
      hardwareKekVersion,
      kekSalt,
      kekWrap,
      iv: 'x', ct: 'x',
      kdf: 'kek-dek',
      v: VAULT_VERSION_V3,
    };
    expect(dec.decode(vaultAad(blob))).toBe(canonicalV3Aad);
  });

  it('canonicalizes the kekWrap sub-object', () => {
    const blob = {
      v: VAULT_VERSION_V3, kdf: 'kek-dek',
      iv: 'x', ct: 'x',
      // kekWrap keys in reverse order:
      kekWrap: { ct: kekWrap.ct, iv: kekWrap.iv, v: kekWrap.v },
      kekSalt, hardwareKekVersion,
    };
    expect(dec.decode(vaultAad(blob))).toBe(canonicalV3Aad);
  });

  it('v:2 kek-dek AAD is UNCHANGED by the v:3 addition', () => {
    // Regression: a v:2 blob must still produce the pre-#1111 AAD,
    // otherwise every existing user's vault fails to decrypt.
    const blob = { v: 2, kdf: 'kek-dek', iv: 'x', ct: 'x' };
    expect(dec.decode(vaultAad(blob))).toBe(JSON.stringify({ v: 2, kdf: 'kek-dek' }));
  });

  it('v:2 kek-dek IGNORES kekWrap/kekSalt/hardwareKekVersion on the input', () => {
    // A v:2 blob that happens to carry v:3 shape fields still binds only
    // {v, kdf}. This is what protects existing users from a shape drift.
    const blob = { v: 2, kdf: 'kek-dek', iv: 'x', ct: 'x', kekWrap, kekSalt, hardwareKekVersion };
    expect(dec.decode(vaultAad(blob))).toBe(JSON.stringify({ v: 2, kdf: 'kek-dek' }));
  });

  it('v:3 for an Argon2id blob is IDENTICAL to v:2 (no v:3 Argon2id path in Phase 0a)', () => {
    // Argon2id blobs already bind `salt`. The v:3 addition is a
    // kek-dek-only concern; a hypothetical v:3 Argon2id blob binds the
    // same fields as v:2. Documented here so a future v:3 Argon2id
    // change lights this test up.
    const kdf = { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 };
    const blob = { v: VAULT_VERSION_V3, kdf, salt: 'dGVzdHNhbHQ=', iv: 'x', ct: 'x' };
    expect(dec.decode(vaultAad(blob))).toBe(JSON.stringify({ v: VAULT_VERSION_V3, kdf, salt: 'dGVzdHNhbHQ=' }));
  });
});

describe('vault v:3 — round-trip through encryptVaultWithDekV3 + decryptVaultWithDek', () => {
  it('a v:3 kek-dek blob round-trips with the same DEK', async () => {
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('the-seed-payload', dek, binding());
    expect(blob.v).toBe(VAULT_VERSION_V3);
    expect(blob.kdf).toBe('kek-dek');
    // The reader auto-selects the v:3 AAD via blob.v — no separate
    // decryptVaultWithDekV3 needed.
    const back = await decryptVaultWithDek(blob, dek);
    expect(back).toBe('the-seed-payload');
  });

  it('the returned blob carries the binding fields the AAD authenticated', async () => {
    // Callers write the blob back to storage as-is (spread over) and
    // rely on the AAD-bound fields being present. If encryptVaultWithDekV3
    // ever strips them, the very next decrypt fails.
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('seed', dek, binding());
    expect(blob.kekWrap).toEqual(kekWrap);
    expect(blob.kekSalt).toBe(kekSalt);
    expect(blob.hardwareKekVersion).toBe(hardwareKekVersion);
  });
});

describe('vault v:3 — field-swap attacks fail at decrypt (the property #1111 buys)', () => {
  it('swapping kekWrap on a v:3 blob breaks decrypt', async () => {
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('seed', dek, binding());
    const swapped = { ...blob, kekWrap: { v: 2, iv: 'ZmFrZUlWMTIzNA==', ct: 'ZmFrZUNUMTIzNA==' } };
    await expect(decryptVaultWithDek(swapped, dek)).rejects.toThrow(/Decryption failed/);
  });

  it('swapping kekSalt breaks decrypt', async () => {
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('seed', dek, binding());
    const swapped = { ...blob, kekSalt: 'ZmFrZVNhbHRWYWx1ZQ==' };
    await expect(decryptVaultWithDek(swapped, dek)).rejects.toThrow(/Decryption failed/);
  });

  it('swapping hardwareKekVersion breaks decrypt', async () => {
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('seed', dek, binding());
    const swapped = { ...blob, hardwareKekVersion: 2 };
    await expect(decryptVaultWithDek(swapped, dek)).rejects.toThrow(/Decryption failed/);
  });

  it('downgrading v:3 → v:2 on the same ciphertext breaks decrypt', async () => {
    // The GCM tag is bound to `v: 3` inside the AAD. A downgrade attempt
    // that flips only v (leaving ciphertext) must fail closed — this
    // is what protects against a rollback that would strip the v:3
    // AAD field bindings.
    const dek = randomDek();
    const blob = await encryptVaultWithDekV3('seed', dek, binding());
    const downgraded = { ...blob, v: 2 };
    await expect(decryptVaultWithDek(downgraded, dek)).rejects.toThrow(/Decryption failed/);
  });
});

describe('vault v:3 — rotation-path reseal (the Codex [P1] fix)', () => {
  // This is what the KEK-rotation paths in native.js:755, native.js:1020, and
  // web.js:754 now do on a v:3 blob: decrypt with old binding, re-encrypt
  // with new binding under the SAME DEK. Anything else corrupts the tag
  // and permanently locks the vault (the [P1] Codex flagged before this
  // change landed).
  it('rotate binding on a v:3 blob: decrypt-then-reseal keeps the seed readable', async () => {
    const dek = randomDek();
    // Original blob with binding A.
    const originalBlob = await encryptVaultWithDekV3('seed-payload', dek, binding());
    expect(originalBlob.v).toBe(VAULT_VERSION_V3);

    // The rotation-path pattern in native.js / web.js:
    const seed = await decryptVaultWithDek(originalBlob, dek);
    const newBinding = {
      kekWrap: { v: 2, iv: 'bmV3SVYxMjM0NTY=', ct: 'bmV3Q1QxMjM0NTY=' },
      kekSalt: 'bmV3S2VrU2FsdEIzMg==',
      hardwareKekVersion: 3,
    };
    const rotated = await encryptVaultWithDekV3(seed, dek, newBinding);

    // The rotated blob decrypts cleanly under the new binding.
    expect(await decryptVaultWithDek(rotated, dek)).toBe('seed-payload');

    // And crucially, if the rotation had done a HEADER-ONLY rewrite (spread
    // the new binding fields over the OLD ciphertext without reseal),
    // decrypt would fail — this test would go red before the reseal fix.
    const headerOnlyRewrite = { ...originalBlob, ...newBinding };
    await expect(decryptVaultWithDek(headerOnlyRewrite, dek)).rejects.toThrow(/Decryption failed/);
  });
});

describe('vault v:3 — writer fail-closed on incomplete binding', () => {
  it('rejects a call with no binding at all', async () => {
    const dek = randomDek();
    // @ts-expect-error -- deliberately calling without the required binding
    await expect(encryptVaultWithDekV3('seed', dek)).rejects.toThrow(VAULT_ERR.MALFORMED);
  });

  it('rejects a call with a missing kekWrap', async () => {
    const dek = randomDek();
    await expect(encryptVaultWithDekV3('seed', dek, { kekSalt, hardwareKekVersion }))
      .rejects.toThrow(VAULT_ERR.MALFORMED);
  });

  it('rejects a call with a missing kekSalt', async () => {
    const dek = randomDek();
    await expect(encryptVaultWithDekV3('seed', dek, { kekWrap, hardwareKekVersion }))
      .rejects.toThrow(VAULT_ERR.MALFORMED);
  });

  it('rejects a call with a missing hardwareKekVersion', async () => {
    const dek = randomDek();
    await expect(encryptVaultWithDekV3('seed', dek, { kekWrap, kekSalt }))
      .rejects.toThrow(VAULT_ERR.MALFORMED);
  });

  it('ACCEPTS `null` hardwareKekVersion (web vault path — WebAuthn PRF is version-inline)', async () => {
    // Web enrollKek never stores a hardwareKekVersion. The rotation path
    // in web.js coerces the missing field to explicit `null` (see
    // Codex [P1] 2026-08-09 remediation). encryptVaultWithDekV3 must
    // accept `null` as distinct from `undefined` — a null-binding v:3
    // blob is well-formed and round-trips.
    const dek = randomDek();
    const webBinding = { kekWrap, kekSalt, hardwareKekVersion: null };
    const blob = await encryptVaultWithDekV3('seed', dek, webBinding);
    expect(blob.v).toBe(VAULT_VERSION_V3);
    expect(blob.hardwareKekVersion).toBeNull();
    expect(await decryptVaultWithDek(blob, dek)).toBe('seed');
  });
});
