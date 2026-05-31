// wallet-core/__tests__/sol-derivation.test.js
//
// Correctness-as-safety for Solana ed25519 / SLIP-0010 derivation. Uses
// PUBLISHED, PUBLIC test vectors (no funds, no secrets):
//
//   1. The AUTHORITATIVE SLIP-0010 ed25519 test vectors (seed 000102…0f) from
//      the SLIP-0010 spec itself. Passing these proves the derivation MATH is
//      byte-for-byte the published standard — the property that makes a Solana
//      seed recoverable in Phantom/Solflare.
//   2. The canonical BIP-39 all-"abandon" mnemonic derived at the
//      Phantom-compatible path m/44'/501'/0'/0'. The resulting base58 address is
//      pinned so any accidental change to the path/curve is caught, and is
//      independently cross-checked against @solana/web3.js Keypair.fromSeed in
//      the next test file's spirit (the address below was confirmed equal to
//      Keypair.fromSeed(privateKey).publicKey during development).
//
// HANDS-ON GATE (see docs/PhaseSOL.md): the FINAL interop confirmation — that
// this exact address also appears in Phantom/Solflare for the test seed — is a
// manual verification step, like the BTC verified-testnet-send gate.

import { describe, it, expect } from 'vitest';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { deriveEd25519, parseSlip10Path } from '../sol/slip10.js';
import { deriveSolAccount, deriveSolAddress, solPath, isValidSolAddress, SOL_COIN_TYPE } from '../sol/derivation.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('SLIP-0010 ed25519 — authoritative spec test vectors (seed 000102…0f)', () => {
  const seed = hexToBytes('000102030405060708090a0b0c0d0e0f');

  it('m/0\' private key + public key match the SLIP-0010 spec vector', () => {
    // Authoritative SLIP-0010 ed25519 vector for seed 000102…0f at m/0'. This
    // node exercises master-key generation AND one hardened CKD step, so passing
    // it pins the full derivation algorithm to the published standard.
    const node = deriveEd25519(seed, "m/0'");
    expect(bytesToHex(node.key)).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3');
    // SLIP-0010 prefixes the ed25519 public key with 0x00; Solana uses the raw
    // 32 bytes. Compare the raw key against the spec's pubkey minus that prefix.
    const pub = ed25519.getPublicKey(node.key);
    expect('00' + bytesToHex(pub)).toBe('008c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c');
  });

  it('rejects a non-hardened path (ed25519 is hardened-only)', () => {
    expect(() => parseSlip10Path("m/44'/501'/0'/0")).toThrow();
    expect(() => deriveEd25519(seed, 'm/44/501')).toThrow();
  });

  it('accepts both \' and h hardened markers', () => {
    expect(parseSlip10Path("m/44'/501'/0'/0'")).toEqual([44, 501, 0, 0]);
    expect(parseSlip10Path('m/44h/501h/0h/0h')).toEqual([44, 501, 0, 0]);
  });
});

describe('Solana account derivation — Phantom-compatible path', () => {
  it('uses coin type 501 and the 4-level hardened path', () => {
    expect(SOL_COIN_TYPE).toBe(501);
    expect(solPath(0)).toBe("m/44'/501'/0'/0'");
    expect(solPath(3)).toBe("m/44'/501'/3'/0'");
  });

  it('derives the pinned base58 address for the canonical test seed', () => {
    const a = deriveSolAccount(TEST_MNEMONIC);
    expect(a.path).toBe("m/44'/501'/0'/0'");
    // Pinned vector: cross-checked equal to @solana/web3.js Keypair.fromSeed
    // during development; the Phantom/Solflare interop confirmation is a
    // hands-on gate (docs/PhaseSOL.md).
    expect(a.address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  });

  it('returns a 32-byte ed25519 public key and 32-byte private scalar', () => {
    const a = deriveSolAccount(TEST_MNEMONIC);
    expect(a.publicKey).toBeInstanceOf(Uint8Array);
    expect(a.publicKey.length).toBe(32);
    expect(a.privateKey.length).toBe(32);
  });

  it('the derived address is a valid base58 ed25519 pubkey', () => {
    const { address } = deriveSolAddress(TEST_MNEMONIC);
    expect(isValidSolAddress(address)).toBe(true);
  });

  it('distinct addresses per account index', () => {
    const a0 = deriveSolAddress(TEST_MNEMONIC, { account: 0 }).address;
    const a1 = deriveSolAddress(TEST_MNEMONIC, { account: 1 }).address;
    expect(a0).not.toBe(a1);
  });

  it('the public key matches @solana/web3.js Keypair.fromSeed (independent reference)', async () => {
    const { Keypair } = await import('@solana/web3.js');
    const a = deriveSolAccount(TEST_MNEMONIC);
    const kp = Keypair.fromSeed(a.privateKey);
    expect(kp.publicKey.toBase58()).toBe(a.address);
  });
});

describe('isValidSolAddress', () => {
  it('accepts a real derived address', () => {
    expect(isValidSolAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')).toBe(true);
  });
  it('rejects junk / wrong-length / non-base58', () => {
    expect(isValidSolAddress('')).toBe(false);
    expect(isValidSolAddress('not-an-address')).toBe(false);
    expect(isValidSolAddress('0x1234')).toBe(false); // contains 0 (not in base58 alphabet)
    expect(isValidSolAddress('1111')).toBe(false); // valid base58 but too short to be 32 bytes
  });
});
