// lib/__tests__/addressValidation.test.js
//
// The recipient-address guard must accept TESTNET Bitcoin addresses, not just
// mainnet — otherwise the testnet send-verification flow can't enter a real
// `tb1…` recipient (the wallet's OWN BIP-84 testnet address included), and the
// Continue button stays disabled with "Invalid BTC address format". This pins
// that the BTC guard accepts mainnet (1/3/bc1) AND testnet/regtest (tb1/bcrt1)
// bech32 while still rejecting malformed input. The authoritative checksum +
// network match stay enforced by @scure/btc-signer at sign time; this is only a
// shallow UI guard, so format breadth here is safe.

import { describe, it, expect } from 'vitest';
import { isValidAddressForCurrency } from '../addressValidation.js';

describe('isValidAddressForCurrency — BTC accepts testnet, not just mainnet', () => {
  it('accepts mainnet BTC formats (regression)', () => {
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'BTC')).toBe(true);
  });

  it('accepts TESTNET / regtest bech32 (the fix — tb1… / bcrt1…)', () => {
    // A real BIP-84 testnet address from wallet-core/__tests__/btc-derivation.test.js.
    expect(isValidAddressForCurrency('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7k', 'BTC')).toBe(true);
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
