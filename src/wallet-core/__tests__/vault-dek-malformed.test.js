// vault-dek-malformed.test.js
//
// Regression tests for the requiredB64Field guard in decryptVaultWithDek.
// Before the fix, a structurally incomplete blob threw a raw DOMException from
// atob() rather than the typed VAULT_ERR.MALFORMED error code. Each test below
// was RED before the guard was added.

import { describe, it, expect } from 'vitest';
import { decryptVaultWithDek, encryptVaultWithDek, VAULT_ERR } from '../vault.js';

describe('decryptVaultWithDek — malformed blob guard', () => {
  const DEK = crypto.getRandomValues(new Uint8Array(32));

  it('throws VAULT_MALFORMED when iv is missing', async () => {
    const blob = await encryptVaultWithDek('secret', DEK);
    const { iv: _iv, ...noIv } = blob;
    await expect(decryptVaultWithDek(noIv, DEK)).rejects.toMatchObject({
      code: VAULT_ERR.MALFORMED,
      message: VAULT_ERR.MALFORMED,
    });
  });

  it('throws VAULT_MALFORMED when ct is missing', async () => {
    const blob = await encryptVaultWithDek('secret', DEK);
    const { ct: _ct, ...noCt } = blob;
    await expect(decryptVaultWithDek(noCt, DEK)).rejects.toMatchObject({
      code: VAULT_ERR.MALFORMED,
      message: VAULT_ERR.MALFORMED,
    });
  });

  it('throws VAULT_MALFORMED when iv is a number (not a string)', async () => {
    const blob = await encryptVaultWithDek('secret', DEK);
    await expect(decryptVaultWithDek({ ...blob, iv: 42 }, DEK)).rejects.toMatchObject({
      code: VAULT_ERR.MALFORMED,
      message: VAULT_ERR.MALFORMED,
    });
  });

  it('throws VAULT_MALFORMED when iv is an empty string', async () => {
    const blob = await encryptVaultWithDek('secret', DEK);
    await expect(decryptVaultWithDek({ ...blob, iv: '' }, DEK)).rejects.toMatchObject({
      code: VAULT_ERR.MALFORMED,
      message: VAULT_ERR.MALFORMED,
    });
  });

  it('still decrypts a well-formed blob correctly', async () => {
    const secret = 'well-formed seed phrase';
    const blob = await encryptVaultWithDek(secret, DEK);
    await expect(decryptVaultWithDek(blob, DEK)).resolves.toBe(secret);
  });
});
