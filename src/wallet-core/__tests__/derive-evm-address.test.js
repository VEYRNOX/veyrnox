// wallet-core/__tests__/derive-evm-address.test.js
//
// L-1 (S1-S4 audit): deriveEvmAddress derives the checksummed EIP-55 address
// WITHOUT materialising the private key. It must agree exactly with
// deriveEvmAccount (which does materialise the key for signing) so that the
// address-only path is a safe substitute for receive-address display,
// portfolio fetch, and address comparison.

import { describe, it, expect } from 'vitest';
import { deriveEvmAccount, deriveEvmAddress } from '../derivation.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('deriveEvmAddress (address-only, no private key)', () => {
  it('returns a checksummed EIP-55 address (0x-prefixed, length 42)', () => {
    const addr = deriveEvmAddress(TEST_MNEMONIC, 0);
    expect(typeof addr).toBe('string');
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addr.length).toBe(42);
  });

  it('matches deriveEvmAccount for the same mnemonic + index', () => {
    for (const i of [0, 1, 2, 5]) {
      expect(deriveEvmAddress(TEST_MNEMONIC, i)).toBe(
        deriveEvmAccount(TEST_MNEMONIC, i).address
      );
    }
  });

  it('never returns a privateKey field (address string only)', () => {
    const result = deriveEvmAddress(TEST_MNEMONIC, 0);
    // A bare string cannot carry a privateKey — this pins the contract that
    // the return type is the address itself, not an object with secrets.
    expect(typeof result).toBe('string');
    expect(result).not.toHaveProperty?.('privateKey');
  });

  it('produces distinct addresses for index 0 and index 1', () => {
    expect(deriveEvmAddress(TEST_MNEMONIC, 0)).not.toBe(
      deriveEvmAddress(TEST_MNEMONIC, 1)
    );
  });

  it('matches the well-known first Ethereum address for the test mnemonic', () => {
    expect(deriveEvmAddress(TEST_MNEMONIC, 0)).toBe(
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
    );
  });
});
