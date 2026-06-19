// lib/__tests__/addressValidation.test.js
//
// The recipient-address guard validates a BTC address with a REAL checksum + HRP
// check via @scure/btc-signer (the same library + network params enforced at sign
// time), against the currently ENABLED networks. This replaced an earlier shallow
// format regex that did no checksum and accepted any network's prefix. It pins:
//   - valid addresses for an enabled network pass (mainnet is enabled on main, so
//     bc1/1/3 pass; testnet tb1… passes — incl. the wallet's own BIP-84 address),
//   - a CHECKSUM-INVALID address is rejected (the old regex would have passed it),
//   - an address for a NON-enabled network (regtest bcrt1…) is rejected,
//   - malformed / wrong-chain input is rejected.

import { describe, it, expect } from 'vitest';
import { isValidAddressForCurrency } from '../addressValidation.js';

describe('isValidAddressForCurrency — BTC real checksum/network validation', () => {
  it('accepts valid addresses for enabled networks (mainnet bc1/1/3 + testnet tb1…)', () => {
    // Mainnet is enabled on main (owner sign-off), so these are valid recipients.
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'BTC')).toBe(true);
    // A real BIP-84 testnet address from wallet-core/__tests__/btc-derivation.test.js.
    expect(isValidAddressForCurrency('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'BTC')).toBe(true);
  });

  it('rejects a checksum-invalid bech32 (the real fix — the old shallow regex passed these)', () => {
    // Same as the valid tb1 above with the final char flipped — fails bech32 checksum.
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsy', 'BTC')).toBe(false);
    // Valid format/length but corrupted mainnet checksum.
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5', 'BTC')).toBe(false);
  });

  it('rejects an address for a NON-enabled network (regtest bcrt1…)', () => {
    expect(isValidAddressForCurrency('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7k', 'BTC')).toBe(false);
  });

  it('still rejects malformed BTC input', () => {
    expect(isValidAddressForCurrency('zz1notabitcoinaddress', 'BTC')).toBe(false);
    expect(isValidAddressForCurrency('bc1', 'BTC')).toBe(false); // too short
    expect(isValidAddressForCurrency('0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729', 'BTC')).toBe(false); // EVM, not BTC
  });

  it('empty address is valid here (the required-field case is the form\'s job)', () => {
    expect(isValidAddressForCurrency('', 'BTC')).toBe(true);
  });

  it('SOL + EVM guards are unchanged', () => {
    expect(isValidAddressForCurrency('Cp5MYrCMbUe7wra4ziGsVN672ZjpeLi5CFNj4Je7yFWK', 'SOL')).toBe(true);
    expect(isValidAddressForCurrency('0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729', 'ETH')).toBe(true);
    expect(isValidAddressForCurrency('not-an-eth-address', 'ETH')).toBe(false);
  });
});
