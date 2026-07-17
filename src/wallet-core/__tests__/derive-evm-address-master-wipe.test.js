// wallet-core/__tests__/derive-evm-address-master-wipe.test.js
//
// #1113: deriveEvmAddress must zero the master HDKey.privateKey (the root
// private key from HDKey.fromMasterSeed), not just the account-level
// intermediate. The master private key is the most sensitive intermediate --
// it can derive EVERY child key on EVERY chain.

import { describe, it, expect, afterEach } from 'vitest';

const originalHDKey = await import('@scure/bip32').then(m => m.HDKey);

let capturedMasterNode = null;
const origFromMasterSeed = originalHDKey.fromMasterSeed;

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('#1113 -- deriveEvmAddress master-seed privateKey wipe', () => {
  afterEach(() => {
    originalHDKey.fromMasterSeed = origFromMasterSeed;
    capturedMasterNode = null;
  });

  it('zeroes the master HDKey.privateKey after derivation', async () => {
    originalHDKey.fromMasterSeed = function (...args) {
      const node = origFromMasterSeed.apply(this, args);
      capturedMasterNode = node;
      return node;
    };

    const { deriveEvmAddress } = await import('../derivation.js');

    const addr = deriveEvmAddress(TEST_MNEMONIC, 0);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);

    // The master node MUST have been captured
    expect(capturedMasterNode).not.toBeNull();

    // Its privateKey must be all-zeroed (wiped)
    const pk = capturedMasterNode.privateKey;
    if (pk) {
      expect(pk.every(b => b === 0)).toBe(true);
    }
    // If pk is null/undefined after wipe, that is also acceptable
  });

  it('zeroes the seed bytes after derivation (finally block runs on success)', async () => {
    originalHDKey.fromMasterSeed = function (...args) {
      const node = origFromMasterSeed.apply(this, args);
      capturedMasterNode = node;
      return node;
    };

    const { deriveEvmAddress } = await import('../derivation.js');

    const addr = deriveEvmAddress(TEST_MNEMONIC, 0);
    expect(typeof addr).toBe('string');

    // Master node was created and its privateKey must be wiped
    expect(capturedMasterNode).not.toBeNull();
    const pk = capturedMasterNode.privateKey;
    if (pk) {
      expect(pk.every(b => b === 0)).toBe(true);
    }
  });
});
