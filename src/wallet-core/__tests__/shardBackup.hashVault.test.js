import { describe, it, expect, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');

const {
  splitDekForPersonalBackup,
  encodeShareBundle,
  decodeShareBundle,
  combineFromBundles,
  SHARD_BUNDLE_MISMATCH,
  SHARD_BUNDLE_INVALID,
  SHARD_BUNDLE_VERSION,
  SECRET_SIZE,
  SHARE_SIZE,
} = await import('../shardBackup.js');

function fakeVault(overrides = {}) {
  return {
    v: 3,
    kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
    salt: 'c2FsdC1zYWx0LXNhbHQtc2FsdA==',
    iv: 'aXYtaXYtaXYtaXY=',
    ct: 'Y2lwaGVydGV4dC1jaXBoZXJ0ZXh0LWNpcGhlcnRleHQ=',
    ...overrides,
  };
}

function randomDek() {
  const buf = new Uint8Array(SECRET_SIZE);
  crypto.getRandomValues(buf);
  return buf;
}

function b64enc(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// The OLD (buggy) hasher: JSON.stringify's array replacer is a key FILTER at
// every nesting level, so any nested object collapses to '{}'.
function legacyHashVault(vault) {
  const canonical = JSON.stringify(vault, Object.keys(vault).sort());
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}

describe('hashVault — canonical nested integrity (Codex P2)', () => {
  it('bumps SHARD_BUNDLE_VERSION to 2', () => {
    expect(SHARD_BUNDLE_VERSION).toBe(2);
  });

  it('two vaults differing only in kdf.iterations produce different hashes', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vaultA = fakeVault();
    const vaultB = fakeVault({ kdf: { ...vaultA.kdf, iterations: 4 } });
    const bundleA = encodeShareBundle(shares[0], 1, vaultA);
    const bundleB = encodeShareBundle(shares[1], 2, vaultB);
    expect(bundleA.vaultHash).not.toBe(bundleB.vaultHash);
    // And decode must catch a swapped/tampered nested vault, not just accept it.
    const tampered = { ...bundleA, vault: vaultB };
    expect(() => decodeShareBundle(tampered)).toThrow(SHARD_BUNDLE_MISMATCH);
  });

  it('same content, different top-level key order → same hash (canonicalisation)', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vault = fakeVault();
    const reordered = { ct: vault.ct, iv: vault.iv, salt: vault.salt, kdf: vault.kdf, v: vault.v };
    const a = encodeShareBundle(shares[0], 1, vault);
    const b = encodeShareBundle(shares[1], 2, reordered);
    expect(a.vaultHash).toBe(b.vaultHash);
  });

  it('detects a change in a nested array element', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vaultA = fakeVault({ extra: { list: [1, 2, 3] } });
    const vaultB = fakeVault({ extra: { list: [1, 2, 4] } });
    const bundleA = encodeShareBundle(shares[0], 1, vaultA);
    const tampered = { ...bundleA, vault: vaultB };
    expect(() => decodeShareBundle(tampered)).toThrow(SHARD_BUNDLE_MISMATCH);
  });

  // 2026-08-15: the v1 compatibility branch was REMOVED. `v` is read from the
  // same file being validated, so accepting v1 let an attacker-supplied bundle
  // select the weak top-level-only verifier for itself. Confirmed safe to drop:
  // VITE_ENABLE_PERSONAL_BACKUP_SHARDS is set in no shipping build, so no user
  // could hold a v1 bundle.
  it('a v1 bundle is REJECTED even when its legacy hash is internally consistent', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vault = fakeVault();
    const legacyBundle = {
      v: 1,
      shareIndex: 1,
      shareBytes: b64enc(shares[0]),
      vault,
      vaultHash: legacyHashVault(vault),
      meta: { createdAt: new Date(0).toISOString() },
    };
    expect(() => decodeShareBundle(legacyBundle)).toThrow(SHARD_BUNDLE_INVALID);
  });

  // The case the removed branch actually accepted: under legacyHashVault a
  // nested object serialises to '{}', so mutating vault.kdf leaves the hash
  // unchanged. Rejecting on version closes it before the hash is ever compared.
  it('a v1 bundle with a tampered nested vault.kdf is rejected (was accepted pre-removal)', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vault = fakeVault();
    const tamperedVault = fakeVault({ kdf: { ...vault.kdf, iterations: 1 } });
    // Same legacy hash despite differing kdf — this is the bug, asserted directly.
    expect(legacyHashVault(tamperedVault)).toBe(legacyHashVault(vault));
    const legacyBundle = {
      v: 1,
      shareIndex: 1,
      shareBytes: b64enc(shares[0]),
      vault: tamperedVault,
      vaultHash: legacyHashVault(vault),
      meta: { createdAt: new Date(0).toISOString() },
    };
    expect(() => decodeShareBundle(legacyBundle)).toThrow(SHARD_BUNDLE_INVALID);
  });

  it('encodeShareBundle always emits v2', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const bundle = encodeShareBundle(shares[0], 1, fakeVault());
    expect(bundle.v).toBe(2);
  });

  it('v2 bundle round-trips encode → decode → combineFromBundles', () => {
    const dek = randomDek();
    const vault = fakeVault();
    const shares = splitDekForPersonalBackup(dek);
    const bundles = shares.map((s, i) => encodeShareBundle(s, i + 1, vault));
    const { dek: recon, vault: v2 } = combineFromBundles([bundles[0], bundles[1]]);
    expect(recon).toEqual(dek);
    expect(v2).toEqual(vault);
    recon.fill(0);
  });
});
