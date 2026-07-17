// wallet-core/__tests__/derive-evm-address.test.js
//
// L-1 (S1-S4 audit): deriveEvmAddress derives the checksummed EIP-55 address
// WITHOUT materialising the private key. It must agree exactly with
// deriveEvmAccount (which does materialise the key for signing) so that the
// address-only path is a safe substitute for receive-address display,
// portfolio fetch, and address comparison.

import { describe, it, expect, vi } from 'vitest';
import * as bip32 from '@scure/bip32';
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

  // #1113 (L-1 90%): PR #1080 wiped the account-level privateKey but the
  // MASTER HDKey.privateKey persisted until GC. Assert we now zero it.
  it('wipes the master HDKey.privateKey after derivation (#1113)', () => {
    const origFromMasterSeed = bip32.HDKey.fromMasterSeed.bind(bip32.HDKey);
    const captured = [];
    const spy = vi
      .spyOn(bip32.HDKey, 'fromMasterSeed')
      .mockImplementation((seed) => {
        const m = origFromMasterSeed(seed);
        captured.push(m);
        return m;
      });
    try {
      deriveEvmAddress(TEST_MNEMONIC, 0);
      expect(captured.length).toBeGreaterThanOrEqual(1);
      const master = captured[0];
      // After the call returns, the master's private key bytes must be zeroed.
      const pk = master.privateKey;
      expect(pk).toBeTruthy();
      expect(Array.from(pk).every((b) => b === 0)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
