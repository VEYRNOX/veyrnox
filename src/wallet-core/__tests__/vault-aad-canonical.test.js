import { describe, it, expect } from 'vitest';
import { vaultAad } from '../vault.js';
const dec = new TextDecoder();
describe('#1110 -- vaultAad canonical field order', () => {
  const CK = { name: 'argon2id', parallelism: 1, iterations: 3, memorySize: 196608, hashLength: 32 };
  const CA = JSON.stringify({ v: 2, kdf: CK, salt: 'dGVzdHNhbHQ=' });
  const CD = JSON.stringify({ v: 2, kdf: 'kek-dek' });
  it('canonicalizes kdf sub-object regardless of property insertion order', () => {
    const blob = { v: 2, kdf: { hashLength: 32, memorySize: 196608, name: 'argon2id', iterations: 3, parallelism: 1 }, salt: 'dGVzdHNhbHQ=' };
    expect(dec.decode(vaultAad(blob))).toBe(CA);
  });
  it('canonicalizes top-level fields regardless of blob property order', () => {
    expect(dec.decode(vaultAad({ salt: 'dGVzdHNhbHQ=', kdf: CK, v: 2, iv: 'x', ct: 'x' }))).toBe(CA);
  });
  it('canonicalizes kek-dek blob regardless of property order', () => {
    expect(dec.decode(vaultAad({ ct: 'x', kdf: 'kek-dek', v: 2, salt: 'stale', iv: 'x' }))).toBe(CD);
  });
  it('ignores unknown kdf properties', () => {
    expect(dec.decode(vaultAad({ v: 2, kdf: { ...CK, futureField: 'x' }, salt: 'dGVzdHNhbHQ=' }))).toBe(CA);
  });
});
