// wallet-core/__tests__/btc-validate.test.js
//
// isValidBtcAddress / assertValidBtcAddress: real checksum + HRP validation via
// @scure/btc-signer's Address decoder — the SAME library + network params used at
// sign time (addOutputAddress) — so the UI guard, the early send-path assert, and
// the crypto backstop can never disagree.
import { describe, it, expect } from 'vitest';
import { TEST_NETWORK, NETWORK } from '@scure/btc-signer';
import { isValidBtcAddress, assertValidBtcAddress } from '../btc/validate.js';

const TB1 = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';     // valid testnet BIP-84
const BC1 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';     // valid mainnet bech32
const BC1_BADSUM = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'; // corrupted checksum
const BCRT1 = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7k';        // regtest

describe('isValidBtcAddress — network-aware checksum validation', () => {
  it('validates against an explicit params set (network-correct)', () => {
    expect(isValidBtcAddress(TB1, [TEST_NETWORK])).toBe(true);
    expect(isValidBtcAddress(BC1, [TEST_NETWORK])).toBe(false); // mainnet addr, testnet params
    expect(isValidBtcAddress(BC1, [NETWORK])).toBe(true);
    expect(isValidBtcAddress(TB1, [NETWORK])).toBe(false);      // testnet addr, mainnet params
  });

  it('rejects a checksum-invalid address even with the right network', () => {
    expect(isValidBtcAddress(BC1_BADSUM, [NETWORK])).toBe(false);
  });

  it('rejects a regtest address against testnet params', () => {
    expect(isValidBtcAddress(BCRT1, [TEST_NETWORK])).toBe(false);
  });

  it('rejects empty / non-string / garbage', () => {
    expect(isValidBtcAddress('', [TEST_NETWORK])).toBe(false);
    expect(isValidBtcAddress(null, [TEST_NETWORK])).toBe(false);
    expect(isValidBtcAddress(undefined, [TEST_NETWORK])).toBe(false);
    expect(isValidBtcAddress('not-an-address', [TEST_NETWORK])).toBe(false);
  });

  it('with no params list, falls back to the ENABLED networks (testnet passes)', () => {
    // The wallet's own testnet recipient must validate via the default enabled set.
    expect(isValidBtcAddress(TB1)).toBe(true);
  });
});

describe('assertValidBtcAddress — throwing variant for the send path', () => {
  it('does not throw for a valid address on the matching network', () => {
    expect(() => assertValidBtcAddress(TB1, TEST_NETWORK)).not.toThrow();
    expect(() => assertValidBtcAddress(BC1, NETWORK)).not.toThrow();
  });

  it('throws a legible error for a wrong-network / malformed address', () => {
    expect(() => assertValidBtcAddress(BC1, TEST_NETWORK)).toThrow(/Invalid Bitcoin recipient/);
    expect(() => assertValidBtcAddress(BC1_BADSUM, NETWORK)).toThrow(/Invalid Bitcoin recipient/);
    expect(() => assertValidBtcAddress('', TEST_NETWORK)).toThrow(/Invalid Bitcoin recipient/);
  });
});
