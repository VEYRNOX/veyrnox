import { describe, it, expect } from 'vitest';
import { decodeKekSalt, parseVaultBlob, KEK_ERR } from '../kek.js';

describe('MALFORMED_VAULT throws carry .code (wipe-counter safety)', () => {
  const cases = [
    ['decodeKekSalt — missing',       () => decodeKekSalt(undefined)],
    ['decodeKekSalt — empty',         () => decodeKekSalt('')],
    ['decodeKekSalt — non-string',    () => decodeKekSalt(42)],
    ['decodeKekSalt — invalid b64',   () => decodeKekSalt('!!!not-base64!!!')],
    ['decodeKekSalt — wrong length',  () => decodeKekSalt(btoa('short'))],
    ['parseVaultBlob — non-string',   () => parseVaultBlob(42)],
    ['parseVaultBlob — bad JSON',     () => parseVaultBlob('{broken')],
    ['parseVaultBlob — null JSON',    () => parseVaultBlob('null')],
    ['parseVaultBlob — array JSON',   () => parseVaultBlob('[]')],
  ];

  it.each(cases)('%s', (_label, fn) => {
    let err;
    try { fn(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(KEK_ERR.MALFORMED_VAULT);
    expect(err.code).toBe(KEK_ERR.MALFORMED_VAULT);
  });
});
