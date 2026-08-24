// wallet-core/keystore/__tests__/fastpathDekCache.test.js
//
// Issue #2019 — fast-path DEK cache primitive.
//
// This file exists to pin the SECURITY-CRITICAL DECISIONS of the fast-path
// wrap primitive so a future refactor cannot silently:
//  - collapse the fast-path slot into Personal Backup's dek-cache (owner Q5:
//    separate slot, distinct AAD, cross-slot mixup fails closed);
//  - swap the AAD version;
//  - swap the storage-key name;
//  - or leak a distinct-code oracle back into the caller.
//
// These are the same failure modes dekCache.test.js pins for its own slot;
// this test is that file's sibling, targeting the SECOND slot the design doc
// (docs/kek-fast-path-design.md) mandates.

import { describe, it, expect } from 'vitest';

import {
  wrapForFastpath,
  unwrapFromFastpath,
  FASTPATH_DEK_V1,
  FASTPATH_DEK_STORAGE_KEY,
  FASTPATH_UNWRAP_FAILED,
} from '../fastpathDekCache.js';
import { wrapDekForCache, DEK_CACHE_UNWRAP_FAILED } from '../dekCache.js';
import { KEK_ERR } from '../kek.js';

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
const someKek = () => randomBytes(32);
const someDek = () => randomBytes(32);

describe('fastpathDekCache — constants', () => {
  it('exports the version marker as 1', () => {
    expect(FASTPATH_DEK_V1).toBe(1);
  });

  it('exports a storage-key name DISTINCT from dek-cache/v1 (owner Q5)', () => {
    // Owner ruling: separate slot from Personal Backup's `dek-cache/v1`
    // (docs/kek-fast-path-design.md §Open questions Q5). If a future PR
    // unifies the slots this test tells you exactly which line to look at.
    expect(FASTPATH_DEK_STORAGE_KEY).toBe('vault_fastpath_dek_v1');
    expect(FASTPATH_DEK_STORAGE_KEY).not.toBe('vault_dek_v1');
  });

  it('exports a distinct failure code (not DEK_CACHE_UNWRAP_FAILED)', () => {
    // Same discipline as dekCache: callers can distinguish a fast-path miss
    // from a Personal Backup cache miss, both remain generic to the user.
    expect(FASTPATH_UNWRAP_FAILED).toBe('FASTPATH_UNWRAP_FAILED');
    expect(FASTPATH_UNWRAP_FAILED).not.toBe(DEK_CACHE_UNWRAP_FAILED);
    expect(FASTPATH_UNWRAP_FAILED).not.toBe(KEK_ERR.UNWRAP_FAILED);
  });
});

describe('fastpathDekCache — round-trip', () => {
  it('wraps a 32-byte DEK and unwraps it back exactly', async () => {
    const kek = someKek();
    const dek = someDek();
    const blob = await wrapForFastpath(kek, dek);
    const back = await unwrapFromFastpath(kek, blob);
    expect(back).toEqual(dek);
  });

  it('rejects a wrong-shape DEK on wrap (fail-closed, MALFORMED_VAULT)', async () => {
    const kek = someKek();
    await expect(wrapForFastpath(kek, randomBytes(31))).rejects.toThrow(
      KEK_ERR.MALFORMED_VAULT,
    );
  });

  it('rejects a wrong-shape KEK on wrap (fail-closed, MALFORMED_VAULT)', async () => {
    await expect(wrapForFastpath(randomBytes(31), someDek())).rejects.toThrow(
      KEK_ERR.MALFORMED_VAULT,
    );
  });
});

describe('fastpathDekCache — cross-slot rejection (owner Q5, I4)', () => {
  it('a dek-cache blob (AAD dek-cache/v1) does NOT unwrap as fast-path', async () => {
    // The whole point of a distinct AAD is that a slot mixup fails closed.
    // Wrap with dek-cache, try to unwrap with fastpath under the SAME KEK,
    // must throw FASTPATH_UNWRAP_FAILED — never return the DEK, never leak
    // that the reason is "wrong AAD" vs "wrong KEK".
    const kek = someKek();
    const dek = someDek();
    const dekCacheBlob = await wrapDekForCache(kek, dek);
    await expect(unwrapFromFastpath(kek, dekCacheBlob)).rejects.toThrow(
      FASTPATH_UNWRAP_FAILED,
    );
  });

  it('a fast-path blob under a wrong KEK fails with the SAME generic code (no oracle)', async () => {
    const kek = someKek();
    const wrongKek = someKek();
    const blob = await wrapForFastpath(kek, someDek());
    await expect(unwrapFromFastpath(wrongKek, blob)).rejects.toThrow(
      FASTPATH_UNWRAP_FAILED,
    );
  });

  it('a structurally-broken blob fails with the SAME generic code (no oracle)', async () => {
    const kek = someKek();
    await expect(unwrapFromFastpath(kek, null)).rejects.toThrow(FASTPATH_UNWRAP_FAILED);
    await expect(unwrapFromFastpath(kek, { v: 2, iv: 'aa', ct: 'bb' })).rejects.toThrow(
      FASTPATH_UNWRAP_FAILED,
    );
    await expect(unwrapFromFastpath(kek, { v: 1, iv: 42, ct: 'bb' })).rejects.toThrow(
      FASTPATH_UNWRAP_FAILED,
    );
  });
});
