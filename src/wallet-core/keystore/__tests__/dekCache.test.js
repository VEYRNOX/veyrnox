import { describe, it, expect } from 'vitest';

import {
  wrapDekForCache,
  unwrapDekFromCache,
  DEK_CACHE_V1,
  DEK_CACHE_STORAGE_KEY,
  DEK_CACHE_UNWRAP_FAILED,
} from '../dekCache.js';
import { wrapDek, unwrapDek, KEK_ERR } from '../kek.js';

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const someKek = () => randomBytes(32);
const someDek = () => randomBytes(32);

describe('dekCache — constants', () => {
  it('exports the version marker as 1', () => {
    expect(DEK_CACHE_V1).toBe(1);
  });

  it('exports the storage-key name from spec §4.1 (vault_dek_v1)', () => {
    // Anchored to the spec by design: if the spec renames the slot, this
    // test tells you exactly which file needs to change.
    expect(DEK_CACHE_STORAGE_KEY).toBe('vault_dek_v1');
  });

  it('exports a distinct failure code (not KEK_UNWRAP_FAILED)', () => {
    // The whole point of the separate module is that a cache miss is
    // distinguishable from a primary vault unwrap failure at the CODE
    // level so callers can fall back, without leaking any information
    // in the ERROR MESSAGE (both remain generic).
    expect(DEK_CACHE_UNWRAP_FAILED).toBe('DEK_CACHE_UNWRAP_FAILED');
    expect(DEK_CACHE_UNWRAP_FAILED).not.toBe(KEK_ERR.UNWRAP_FAILED);
  });
});

describe('dekCache — round-trip', () => {
  it('wraps a 32-byte DEK and unwraps it back exactly', async () => {
    const kek = someKek();
    const dek = someDek();
    const blob = await wrapDekForCache(kek, dek);
    const back = await unwrapDekFromCache(kek, blob);
    expect(back).toEqual(dek);
  });

  it('produces a blob of the shape { v, iv, ct }', async () => {
    const blob = await wrapDekForCache(someKek(), someDek());
    expect(blob.v).toBe(DEK_CACHE_V1);
    expect(typeof blob.iv).toBe('string');
    expect(typeof blob.ct).toBe('string');
  });

  it('produces a different iv every call (fresh randomness)', async () => {
    const kek = someKek();
    const dek = someDek();
    const a = await wrapDekForCache(kek, dek);
    const b = await wrapDekForCache(kek, dek);
    expect(a.iv).not.toBe(b.iv);
    // ct also differs because iv differs (AES-GCM is IV-unique).
    expect(a.ct).not.toBe(b.ct);
  });

  it('handles all-zero DEK material (still a valid 32-byte input)', async () => {
    // The wrap function should not implicitly reject zero-material — that
    // is a caller-level policy decision (shamir.js rejects all-zero secrets
    // as ALL_ZERO_SECRET; a DEK cache does not, because a DEK-shape mask
    // is the caller's responsibility here).
    const dek = new Uint8Array(32);
    const kek = someKek();
    const blob = await wrapDekForCache(kek, dek);
    const back = await unwrapDekFromCache(kek, blob);
    expect(back).toEqual(dek);
  });

  it('does not mutate the caller\'s DEK buffer', async () => {
    const kek = someKek();
    const dek = someDek();
    const original = new Uint8Array(dek);
    await wrapDekForCache(kek, dek);
    expect(dek).toEqual(original);
  });
});

describe('dekCache — fail-closed matrix', () => {
  it('wrong KEK throws the generic DEK_CACHE_UNWRAP_FAILED', async () => {
    const blob = await wrapDekForCache(someKek(), someDek());
    await expect(unwrapDekFromCache(someKek(), blob)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('tampered ct throws generic', async () => {
    const kek = someKek();
    const blob = await wrapDekForCache(kek, someDek());
    // Flip a byte in the ciphertext base64 in a way that stays base64.
    const bad = { ...blob, ct: blob.ct.replace(/^./, c => c === 'A' ? 'B' : 'A') };
    await expect(unwrapDekFromCache(kek, bad)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('tampered iv throws generic', async () => {
    const kek = someKek();
    const blob = await wrapDekForCache(kek, someDek());
    const bad = { ...blob, iv: blob.iv.replace(/^./, c => c === 'A' ? 'B' : 'A') };
    await expect(unwrapDekFromCache(kek, bad)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('wrong version rejects structurally', async () => {
    const kek = someKek();
    const blob = await wrapDekForCache(kek, someDek());
    await expect(unwrapDekFromCache(kek, { ...blob, v: 2 })).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
    await expect(unwrapDekFromCache(kek, { ...blob, v: 0 })).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('missing fields reject structurally', async () => {
    const kek = someKek();
    await expect(unwrapDekFromCache(kek, null)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
    await expect(unwrapDekFromCache(kek, {})).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
    await expect(unwrapDekFromCache(kek, { v: 1, iv: 'x' })).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
    await expect(unwrapDekFromCache(kek, { v: 1, ct: 'x' })).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('non-32-byte KEK rejects with MALFORMED_VAULT (caller bug, structural)', async () => {
    const dek = someDek();
    await expect(wrapDekForCache(new Uint8Array(16), dek)).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
    await expect(wrapDekForCache(new Uint8Array(64), dek)).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
    await expect(wrapDekForCache(null, dek)).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });

  it('non-32-byte DEK rejects with MALFORMED_VAULT', async () => {
    const kek = someKek();
    await expect(wrapDekForCache(kek, new Uint8Array(16))).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
    await expect(wrapDekForCache(kek, new Uint8Array(64))).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
    await expect(wrapDekForCache(kek, null)).rejects.toThrow(KEK_ERR.MALFORMED_VAULT);
  });
});

describe('dekCache — cross-slot separation from the primary wrap (the whole point)', () => {
  it('a blob produced by wrapDek (primary AAD) does NOT unwrap via unwrapDekFromCache', async () => {
    // This is the invariant. If someone read the wrong Keystore slot and
    // fed a primary vault-wrap blob to unwrapDekFromCache, the distinct
    // AAD must reject it.
    const kek = someKek();
    const dek = someDek();
    const primary = await wrapDek(kek, dek);
    // Shape hack: wrapDek returns { v, iv, ct } too but v is the WRAP version
    // (2), not the cache version. Rejecting on v alone would give a caller a
    // signal ("wrong shape" vs "wrong crypto"), so we ALSO test with v hacked
    // to 1 — the AAD mismatch must be what causes the reject.
    await expect(unwrapDekFromCache(kek, primary)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
    const forgedV = { ...primary, v: DEK_CACHE_V1 };
    await expect(unwrapDekFromCache(kek, forgedV)).rejects.toThrow(DEK_CACHE_UNWRAP_FAILED);
  });

  it('a blob produced by wrapDekForCache does NOT unwrap via unwrapDek', async () => {
    const kek = someKek();
    const dek = someDek();
    const cache = await wrapDekForCache(kek, dek);
    // Same trick going the other direction: normalize the version so it's
    // AAD-vs-AAD that decides.
    await expect(unwrapDek(kek, cache)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
    const forgedV = { ...cache, v: 2 }; // WRAP_V2 in kek.js
    await expect(unwrapDek(kek, forgedV)).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});

describe('dekCache — imports (contract)', () => {
  it('imports only from ./kek.js — no Shamir, no cloud, no storage', async () => {
    // Same discipline as shamir/shardBackup contract tests: read the source
    // and pin the import set so a future edit adding an unrelated
    // dependency lights up this test.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    let hereDir;
    try {
      hereDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      hereDir = path.resolve(process.cwd(), 'src/wallet-core/keystore/__tests__');
    }
    const src = await fs.readFile(
      path.resolve(hereDir, '..', 'dekCache.js'),
      'utf8',
    );
    const importLines = src.split('\n').filter(l => /^\s*import\s/.test(l));
    expect(importLines).toHaveLength(1);
    expect(importLines[0]).toContain('./kek.js');
    // Belt: no textual reference to shamir, cloud, or storage plugins.
    expect(/from ['"].\/shamir|SecureStorage|@aparajita|cloud|iCloud/i.test(src)).toBe(false);
  });
});
