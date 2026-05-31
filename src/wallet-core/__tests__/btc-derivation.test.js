// wallet-core/__tests__/btc-derivation.test.js
//
// Correctness-as-safety for BIP-84 Bitcoin derivation. Uses PUBLISHED, PUBLIC
// test vectors (no funds, no secrets). The mainnet vectors are the AUTHORITATIVE
// ones from the BIP-84 spec itself — passing them proves our HD path + bech32
// P2WPKH encoding match every other compliant wallet (i.e. funds are
// recoverable elsewhere). The testnet address is pinned to what this code
// derives so any accidental change to the testnet path is caught.

import { describe, it, expect } from 'vitest';
import { deriveBtcAccount, deriveBtcAddress, btcPath } from '../btc/derivation.js';

// Canonical BIP-39 all-"abandon" test vector (public, BIP-39 spec).
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-84 derivation — authoritative mainnet vectors (BIP-84 spec)', () => {
  // These three are published verbatim in BIP-84. They are the gold standard.
  it('derives the spec first receive address m/84\'/0\'/0\'/0/0', () => {
    const a = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'mainnet', change: 0, index: 0 });
    expect(a.path).toBe("m/84'/0'/0'/0/0");
    expect(a.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });

  it('derives the spec second receive address m/84\'/0\'/0\'/0/1', () => {
    const a = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'mainnet', change: 0, index: 1 });
    expect(a.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
  });

  it('derives the spec first change address m/84\'/0\'/0\'/1/0', () => {
    const a = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'mainnet', change: 1, index: 0 });
    expect(a.path).toBe("m/84'/0'/0'/1/0");
    expect(a.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });
});

describe('BIP-84 derivation — testnet/signet', () => {
  it('uses coin type 1\' and emits a tb1 (native SegWit) address', () => {
    const a = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'testnet', change: 0, index: 0 });
    expect(a.path).toBe("m/84'/1'/0'/0/0");
    expect(a.address.startsWith('tb1q')).toBe(true);
    // Pinned: the widely-reproduced testnet vector for this mnemonic at this path.
    expect(a.address).toBe('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl');
  });

  it('signet shares the testnet address format (same tb1 address)', () => {
    const t = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet' });
    const s = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'signet' });
    expect(s.address).toBe(t.address);
  });

  it('returns a 33-byte compressed pubkey and 32-byte private key', () => {
    const a = deriveBtcAccount(TEST_MNEMONIC, { networkKey: 'testnet' });
    expect(a.publicKey).toBeInstanceOf(Uint8Array);
    expect(a.publicKey.length).toBe(33);
    expect(a.privateKey.length).toBe(32);
  });
});

describe('BIP-84 derivation — interop caveat + indexing', () => {
  it('mainnet and testnet derive DIFFERENT addresses (coin-type separation)', () => {
    const m = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'mainnet' });
    const t = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet' });
    expect(m.address).not.toBe(t.address);
  });

  it('distinct addresses per index on the same chain', () => {
    const a0 = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet', index: 0 }).address;
    const a1 = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet', index: 1 }).address;
    expect(a0).not.toBe(a1);
  });

  it('external and change chains diverge at the same index', () => {
    const ext = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet', change: 0, index: 0 }).address;
    const chg = deriveBtcAddress(TEST_MNEMONIC, { networkKey: 'testnet', change: 1, index: 0 }).address;
    expect(ext).not.toBe(chg);
  });

  it('btcPath builds the canonical BIP-84 path string', () => {
    expect(btcPath(1, 0, 0)).toBe("m/84'/1'/0'/0/0");
    expect(btcPath(0, 1, 5)).toBe("m/84'/0'/0'/1/5");
  });
});
