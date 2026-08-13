import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_ENABLE_PERSONAL_BACKUP_SHARDS', '1');

const {
  splitDekForPersonalBackup,
  encodeShareBundle,
  decodeShareBundle,
  combineFromBundles,
  SHARD_BUNDLE_INVALID,
  SHARD_BUNDLE_MISMATCH,
  SECRET_SIZE,
} = await import('../shardBackup.js');

function fakeVault() {
  return {
    v: 3,
    kdf: { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 },
    salt: 'c2FsdC1zYWx0LXNhbHQtc2FsdA==',
    iv: 'aXYtaXYtaXYtaXY=',
    ct: 'Y2lwaGVydGV4dC1jaXBoZXJ0ZXh0LWNpcGhlcnRleHQ=',
  };
}

function randomDek() {
  const buf = new Uint8Array(SECRET_SIZE);
  crypto.getRandomValues(buf);
  return buf;
}

describe('shard bundle codec — cross-device restore', () => {
  it('round-trips: encode 3 bundles, combine any 2 → same DEK', () => {
    const dek = randomDek();
    const vault = fakeVault();
    const shares = splitDekForPersonalBackup(dek);
    const bundles = shares.map((s, i) => encodeShareBundle(s, i + 1, vault));

    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      const { dek: recon, vault: v2 } = combineFromBundles([bundles[i], bundles[j]]);
      expect(recon).toEqual(dek);
      expect(v2).toEqual(vault);
      recon.fill(0);
    }
  });

  it('rejects bundles from different vaults (hash mismatch)', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const a = encodeShareBundle(shares[0], 1, fakeVault());
    const b = encodeShareBundle(shares[1], 2, { ...fakeVault(), ct: 'ZGlmZmVyZW50' });
    expect(() => combineFromBundles([a, b])).toThrow(SHARD_BUNDLE_MISMATCH);
  });

  it('rejects two bundles with the same share index', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const vault = fakeVault();
    const a = encodeShareBundle(shares[0], 1, vault);
    const dup = encodeShareBundle(shares[0], 1, vault);
    expect(() => combineFromBundles([a, dup])).toThrow(SHARD_BUNDLE_MISMATCH);
  });

  it('decode accepts JSON string or object', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const bundle = encodeShareBundle(shares[0], 1, fakeVault());
    const asString = JSON.stringify(bundle);
    expect(decodeShareBundle(asString).index).toBe(1);
    expect(decodeShareBundle(bundle).index).toBe(1);
  });

  it('decode rejects tampered vaultHash', () => {
    const dek = randomDek();
    const shares = splitDekForPersonalBackup(dek);
    const b = encodeShareBundle(shares[0], 1, fakeVault());
    b.vaultHash = '0'.repeat(64);
    expect(() => decodeShareBundle(b)).toThrow(SHARD_BUNDLE_MISMATCH);
  });

  it('decode rejects malformed input', () => {
    expect(() => decodeShareBundle('not json')).toThrow(SHARD_BUNDLE_INVALID);
    expect(() => decodeShareBundle({ v: 999 })).toThrow(SHARD_BUNDLE_INVALID);
    expect(() => decodeShareBundle(null)).toThrow(SHARD_BUNDLE_INVALID);
  });
});
