// wallet-core/__tests__/vectors.test.js
//
// Correctness-as-safety tests. These use PUBLISHED, PUBLIC test vectors —
// no real funds, no secret values. A wallet that passes these derives the
// same addresses as every other compliant wallet, which is what makes a
// user's funds recoverable elsewhere.
//
// Run with vitest (recommended) or adapt to your runner.
//
//   npm i -D vitest
//   npx vitest run

import { describe, it, expect } from 'vitest';
import { validateMnemonic, mnemonicToSeed } from '../mnemonic.js';
import { deriveEvmAccount } from '../derivation.js';
import { encryptVault, decryptVault } from '../vault.js';
import { bytesToHex } from '@noble/hashes/utils';

// The canonical BIP-39 all-"abandon" test vector (public, from the BIP-39 spec).
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-39 mnemonic', () => {
  it('validates the canonical test vector', () => {
    expect(validateMnemonic(TEST_MNEMONIC)).toBe(true);
  });

  it('rejects a wrong-checksum mnemonic', () => {
    const bad = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(validateMnemonic(bad)).toBe(false);
  });

  it('produces the published seed (empty passphrase)', () => {
    // Known BIP-39 seed for the all-abandon/about mnemonic with no passphrase.
    const expected =
      '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
      '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';
    expect(bytesToHex(mnemonicToSeed(TEST_MNEMONIC))).toBe(expected);
  });
});

describe('EVM derivation (BIP-44 m/44\'/60\'/0\'/0/0)', () => {
  it('derives the well-known first Ethereum address for the test mnemonic', () => {
    // This address is the standard, widely-published derivation result for
    // the all-abandon/about mnemonic at the default Ethereum path.
    const { address, path } = deriveEvmAccount(TEST_MNEMONIC, 0);
    expect(path).toBe("m/44'/60'/0'/0/0");
    expect(address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('derives distinct addresses per account index', () => {
    const a0 = deriveEvmAccount(TEST_MNEMONIC, 0).address;
    const a1 = deriveEvmAccount(TEST_MNEMONIC, 1).address;
    expect(a0).not.toBe(a1);
  });
});

describe('Vault round-trip', () => {
  it('encrypts and decrypts with the correct password', async () => {
    const v = await encryptVault(TEST_MNEMONIC, 'correct horse battery staple');
    const out = await decryptVault(v, 'correct horse battery staple');
    expect(out).toBe(TEST_MNEMONIC);
  });

  it('fails on wrong password (GCM auth)', async () => {
    const v = await encryptVault(TEST_MNEMONIC, 'right-password');
    await expect(decryptVault(v, 'wrong-password')).rejects.toThrow();
  });

  it('fails on tampered ciphertext', async () => {
    const v = await encryptVault(TEST_MNEMONIC, 'pw');
    const tampered = { ...v, ct: v.ct.slice(0, -2) + (v.ct.endsWith('A') ? 'B' : 'A') + '=' };
    await expect(decryptVault(tampered, 'pw')).rejects.toThrow();
  });
});
