// lib/__tests__/addressValidation.test.js
//
// The recipient-address guard validates a BTC address with a REAL checksum + HRP
// check via @scure/btc-signer (the same library + network params enforced at sign
// time). It is NETWORK-AWARE to the app's ACTIVE BTC network: the BTC asset runs on
// TESTNET (assets.js chain: 'testnet'), so the UI guard validates against the active
// testnet params, NOT the global enabled-network list. Even though ALLOW_BTC_MAINNET
// is true (mainnet params are in the enabled list), a MAINNET-format address is the
// wrong network for the active testnet BTC asset and must be rejected inline by the
// Send UI — the signing path also throws, but the UI should fail early and legibly.
//
// It pins:
//   - mainnet-format addresses (bc1/1/3) are INVALID for the active testnet BTC asset,
//   - genuine testnet addresses (tb1…/m/n/2…) are valid (incl. the wallet's own BIP-84),
//   - a CHECKSUM-INVALID address is rejected,
//   - malformed / wrong-chain input is rejected,
//   - SOL + EVM guards are unchanged (no regression).

import { describe, it, expect } from 'vitest';
import { isValidAddressForCurrency } from '../addressValidation.js';

describe('isValidAddressForCurrency — BTC network-aware (active = testnet) validation', () => {
  it('REJECTS mainnet-format addresses for the active testnet BTC asset', () => {
    // Mainnet params are in the enabled list (ALLOW_BTC_MAINNET=true), but the active
    // BTC asset is testnet, so a mainnet recipient is the wrong network and invalid.
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'BTC')).toBe(false);
    expect(isValidAddressForCurrency('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'BTC')).toBe(false);
    expect(isValidAddressForCurrency('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'BTC')).toBe(false);
  });

  it('accepts genuine testnet addresses (tb1… native SegWit)', () => {
    // Real BIP-84 testnet addresses from wallet-core/__tests__/btc-derivation.test.js.
    expect(isValidAddressForCurrency('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl', 'BTC')).toBe(true);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'BTC')).toBe(true);
  });

  it('rejects a checksum-invalid bech32', () => {
    // Same as the valid tb1 above with the final char flipped — fails bech32 checksum.
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsy', 'BTC')).toBe(false);
  });

  it('rejects an address for a NON-active network (regtest bcrt1…)', () => {
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
    // SOL guard must reject EVM and BTC addresses (cross-chain confusion).
    expect(isValidAddressForCurrency('0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729', 'SOL')).toBe(false);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'SOL')).toBe(false);
  });
});
