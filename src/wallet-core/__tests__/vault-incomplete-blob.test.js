// vault-incomplete-blob.test.js
//
// GAP: decryptVault() validated the vault VERSION and the recorded KDF params, but
// never the structural presence/shape of the three base64 fields it immediately
// decodes — salt, iv, ct. A partial write, a truncated restore, or a hand-crafted
// blob therefore reached `unb64(undefined)` -> `atob("undefined")`, which throws a
// RAW `DOMException` (InvalidCharacterError) straight out of the wallet core.
//
// Why that matters (not cosmetic):
//   * I4 (fail honest, fail closed) — a raw platform exception is not an honest
//     failure signal. Callers that classify vault errors (HardwareKekSettings
//     classifyKekError, keystore/web.js, keystore/native.js) match on stable
//     machine codes; a DOMException matches nothing and falls through as an
//     unclassified internal error.
//   * The existing coverage in vault-aad.test.js pins wrong VERSION numbers and
//     wrong PASSWORDS, but every blob it passes is structurally complete. A
//     valid-version blob with a MISSING field was untested in both directions.
//
// These tests assert the machine CODE (VAULT_ERR.MALFORMED), never prose copy.
//
// RED (before the guard):
//   R-1..R-3  missing salt / iv / ct    -> DOMException, no `.code`      -> FAIL
//   R-4       salt is a number          -> wrong-password error or throw -> FAIL
//   R-5       VAULT_ERR not exported                                     -> FAIL
//   R-6       non-base64 salt           -> DOMException                  -> FAIL
//   R-7       structural check precedes the KDF-param check              -> FAIL
// GREEN after the guard. The two GREEN-BY-CONSTRUCTION cases at the end pin the
// behaviour the guard must NOT change (empty-object version error; a well-formed
// blob still spending its KDF — the deniability padding path depends on that).

import { describe, it, expect } from 'vitest';
import { decryptVault, VAULT_ERR } from '../vault.js';

// A structurally COMPLETE v:2 blob. Fields are valid base64 but the ciphertext is
// meaningless — that is fine, every test here must fail long before/at GCM.
// memorySize is the MINIMUM the bounds guard accepts (1 MiB) so the one case that
// deliberately reaches the KDF stays cheap.
const CHEAP_KDF = Object.freeze({
  name: 'argon2id', parallelism: 1, iterations: 1, memorySize: 1024, hashLength: 32,
});

function completeBlob(overrides = {}) {
  return {
    v: 2,
    kdf: { ...CHEAP_KDF },
    salt: btoa('0123456789abcdef'),          // 16 bytes
    iv: btoa('0123456789ab'),                // 12 bytes
    ct: btoa('0123456789abcdef0123456789abcdef'), // 32 bytes (>= GCM tag)
    ...overrides,
  };
}

/**
 * Assert the rejection is the module's stable malformed-blob failure and NOT a raw
 * platform exception. Checking the constructor name is the point of the whole file:
 * a DOMException/TypeError escaping wallet-core is the defect being pinned.
 */
async function expectMalformed(promise) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err, 'expected decryptVault to reject').toBeDefined();
  expect(err.constructor.name).toBe('Error');   // not DOMException, not TypeError
  expect(err.code).toBe(VAULT_ERR.MALFORMED);
  expect(err.message).toBe(VAULT_ERR.MALFORMED);
}

describe('decryptVault — structurally incomplete blob fails closed with a stable code', () => {
  // R-5
  it('exports VAULT_ERR.MALFORMED as a stable, non-empty machine code', () => {
    expect(typeof VAULT_ERR.MALFORMED).toBe('string');
    expect(VAULT_ERR.MALFORMED.length).toBeGreaterThan(0);
    // Frozen: callers switch on this value, it must not be mutable at runtime.
    expect(Object.isFrozen(VAULT_ERR)).toBe(true);
  });

  // R-1
  it('rejects a v:2 blob with salt MISSING (not a raw DOMException)', async () => {
    const blob = completeBlob();
    delete blob.salt;
    await expectMalformed(decryptVault(blob, 'pw123456789012'));
  });

  // R-2
  it('rejects a v:2 blob with iv MISSING', async () => {
    const blob = completeBlob();
    delete blob.iv;
    await expectMalformed(decryptVault(blob, 'pw123456789012'));
  });

  // R-3
  it('rejects a v:2 blob with ct MISSING', async () => {
    const blob = completeBlob();
    delete blob.ct;
    await expectMalformed(decryptVault(blob, 'pw123456789012'));
  });

  // R-1..R-3, v:1 — the legacy no-AAD path decodes the same three fields, so the
  // guard must cover it too. (v:1 blobs are still supported for backward compat.)
  it('rejects a v:1 blob with salt / iv / ct MISSING', async () => {
    for (const field of ['salt', 'iv', 'ct']) {
      const blob = completeBlob({ v: 1 });
      delete blob[field];
      await expectMalformed(decryptVault(blob, 'pw123456789012'));
    }
  });

  // Explicit null / undefined are the shapes a partial JSON write actually produces.
  it('rejects salt / iv / ct present but null or undefined', async () => {
    for (const field of ['salt', 'iv', 'ct']) {
      await expectMalformed(decryptVault(completeBlob({ [field]: null }), 'pw123456789012'));
      await expectMalformed(decryptVault(completeBlob({ [field]: undefined }), 'pw123456789012'));
    }
  });

  // R-4 — a number is the dangerous non-string case: atob() COERCES it, so e.g.
  // salt: 123 -> atob("123") decodes silently to 2 bytes and the failure would
  // surface as a generic wrong-password error instead of a structural one.
  it('rejects salt as a number rather than coercing it through atob()', async () => {
    await expectMalformed(decryptVault(completeBlob({ salt: 123 }), 'pw123456789012'));
  });

  it('rejects iv / ct as non-string types (number, array, object)', async () => {
    for (const field of ['iv', 'ct']) {
      await expectMalformed(decryptVault(completeBlob({ [field]: 123 }), 'pw123456789012'));
      await expectMalformed(decryptVault(completeBlob({ [field]: [1, 2, 3] }), 'pw123456789012'));
      await expectMalformed(decryptVault(completeBlob({ [field]: {} }), 'pw123456789012'));
    }
  });

  // An empty string decodes to a 0-byte salt/iv/ct — never producible by
  // encryptVault (16 / 12 / >=16 bytes), so it is structurally malformed.
  it('rejects empty-string salt / iv / ct', async () => {
    for (const field of ['salt', 'iv', 'ct']) {
      await expectMalformed(decryptVault(completeBlob({ [field]: '' }), 'pw123456789012'));
    }
  });

  // R-6 — a present-but-corrupt field is the same class of defect: atob() throws a
  // raw DOMException on a non-base64 string.
  it('rejects a non-base64 salt without leaking the raw atob DOMException', async () => {
    await expectMalformed(decryptVault(completeBlob({ salt: '!!!not base64!!!' }), 'pw123456789012'));
  });

  // R-7 — ORDERING. The structural check must run BEFORE paramsFromVault, so a blob
  // that is both malformed AND carries the oversized-memorySize OOM payload (B-1)
  // is rejected structurally and never allocates. This case would OOM, not fail, if
  // the guard were placed after the KDF-param read.
  it('runs the structural check BEFORE the KDF-param check (no allocation)', async () => {
    const blob = completeBlob({
      kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 0xFFFFFFFF, hashLength: 32 },
    });
    delete blob.salt;
    await expectMalformed(decryptVault(blob, 'pw123456789012'));
  });
});

describe('decryptVault — behaviour the structural guard must NOT change', () => {
  // The empty object already failed meaningfully via the version check; that check
  // must stay FIRST so the existing vault-aad.test.js version cases keep their
  // error. Pinned here so a future reorder of the validation block is caught.
  it('an empty object still fails on the version check, not the structural one', async () => {
    await expect(decryptVault({}, 'pw123456789012')).rejects.toThrow(/unsupported vault version/i);
    await expect(decryptVault(null, 'pw123456789012')).rejects.toThrow(/unsupported vault version/i);
  });

  // DENIABILITY REGRESSION GUARD (I3): deniabilityUnlock.dummyKdf() and
  // stealth.js pad unconfigured branches by calling decryptVault on a
  // structurally COMPLETE chaff blob purely for its KDF cost. If the new guard
  // ever rejected those early, the padding would cost nothing and unlock timing
  // would become an oracle for "feature not configured". A complete blob must
  // still reach GCM and fail with the generic error, NOT with MALFORMED.
  it('a complete blob with garbage ciphertext still reaches GCM (chaff padding path)', async () => {
    await expect(decryptVault(completeBlob(), 'pw123456789012'))
      .rejects.toThrow(/wrong password or corrupted/i);
  });
});
