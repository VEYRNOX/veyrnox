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

  it('a v1 bundle crafted with the old top-level-only hasher still decodes (backward compat)', () => {
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
    const decoded = decodeShareBundle(legacyBundle);
    expect(decoded.index).toBe(1);
    expect(decoded.share.length).toBe(SHARE_SIZE);
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
