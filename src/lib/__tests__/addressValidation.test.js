// lib/__tests__/addressValidation.test.js
//
// The recipient-address guard validates a BTC address with a REAL checksum + HRP
// check via @scure/btc-signer (the same library + network params enforced at sign
// time). It is NETWORK-AWARE to the app's ACTIVE BTC network: the BTC asset runs on
// MAINNET (assets.js chain: 'mainnet'), so the UI guard validates against the active
// mainnet params. A testnet-format address is the wrong network for the active
// mainnet BTC asset and must be rejected inline by the Send UI.
//
// It pins:
//   - testnet-format addresses (tb1/m/n/2…) are INVALID for the active mainnet BTC asset,
//   - genuine mainnet addresses (bc1…) are valid,
//   - a CHECKSUM-INVALID address is rejected,
//   - malformed / wrong-chain input is rejected,
//   - SOL + EVM guards are unchanged (no regression).

import { describe, it, expect } from 'vitest';
import { isValidAddressForCurrency } from '../addressValidation.js';

describe('isValidAddressForCurrency — BTC network-aware (active = mainnet) validation', () => {
  it('accepts mainnet-format addresses for the active mainnet BTC asset', () => {
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'BTC')).toBe(true);
  });

  it('REJECTS testnet-format addresses for the active mainnet BTC asset', () => {
    expect(isValidAddressForCurrency('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl', 'BTC')).toBe(false);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'BTC')).toBe(false);
  });

  it('rejects a checksum-invalid bech32', () => {
    expect(isValidAddressForCurrency('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5', 'BTC')).toBe(false);
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
    expect(isValidAddressForCurrency('0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729', 'SOL')).toBe(false);
    expect(isValidAddressForCurrency('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'SOL')).toBe(false);
  });
});
