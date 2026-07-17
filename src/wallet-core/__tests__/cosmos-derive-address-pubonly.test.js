// wallet-core/__tests__/cosmos-derive-address-pubonly.test.js
//
// #1109: deriveCosmosAddress must NOT materialise the leaf signing key.
// Mirrors the EVM L-1 pattern (PR #1080): derive private only to the
// hardened account boundary (m/44'/118'/0'), extract publicExtendedKey,
// then derive the non-hardened tail (m/0/index) in public mode.
// Intermediates (master + account private keys) must be zeroed in finally.

import { describe, it, expect, afterEach } from 'vitest';

const originalHDKey = await import('@scure/bip32').then(m => m.HDKey);

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Known-good address from the existing cosmos-derivation.test.js
const EXPECTED_ADDR_0 = 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4';

let capturedMasterNode = null;
const origFromMasterSeed = originalHDKey.fromMasterSeed;

describe('#1109 -- deriveCosmosAddress leaf key never materialised', () => {
  afterEach(() => {
    originalHDKey.fromMasterSeed = origFromMasterSeed;
    capturedMasterNode = null;
  });

  it('returns the correct address (same as deriveCosmosAccount)', async () => {
    const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
    const { address } = deriveCosmosAddress(TEST_MNEMONIC);
    expect(address).toBe(EXPECTED_ADDR_0);
  });

  it('does NOT materialise the leaf private key (public-only derivation via fromExtendedKey)', async () => {
    const origFromExtendedKey = originalHDKey.fromExtendedKey;
    let fromExtendedKeyCalled = false;
    let capturedXpubArg = null;

    originalHDKey.fromExtendedKey = function (...args) {
      fromExtendedKeyCalled = true;
      capturedXpubArg = args[0];
      return origFromExtendedKey.apply(this, args);
    };

    try {
      const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
      deriveCosmosAddress(TEST_MNEMONIC);

      // The public-only pattern MUST call fromExtendedKey with an xpub
      expect(fromExtendedKeyCalled).toBe(true);
      expect(typeof capturedXpubArg).toBe('string');
      expect(capturedXpubArg).toMatch(/^xpub/);
    } finally {
      originalHDKey.fromExtendedKey = origFromExtendedKey;
    }
  });

  it('zeroes the master HDKey.privateKey after derivation', async () => {
    originalHDKey.fromMasterSeed = function (...args) {
      const node = origFromMasterSeed.apply(this, args);
      capturedMasterNode = node;
      return node;
    };

    const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
    deriveCosmosAddress(TEST_MNEMONIC);

    expect(capturedMasterNode).not.toBeNull();
    const pk = capturedMasterNode.privateKey;
    if (pk) {
      expect(pk.every(b => b === 0)).toBe(true);
    }
  });

  it('produces distinct addresses for different indices', async () => {
    const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
    const a0 = deriveCosmosAddress(TEST_MNEMONIC, { index: 0 });
    const a1 = deriveCosmosAddress(TEST_MNEMONIC, { index: 1 });
    expect(a0.address).not.toBe(a1.address);
  });

  it('supports custom HRP (osmo, juno)', async () => {
    const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
    const osmo = deriveCosmosAddress(TEST_MNEMONIC, { hrp: 'osmo' });
    expect(osmo.address).toMatch(/^osmo1/);
    const juno = deriveCosmosAddress(TEST_MNEMONIC, { hrp: 'juno' });
    expect(juno.address).toMatch(/^juno1/);
  });

  it('returns no privateKey property', async () => {
    const { deriveCosmosAddress } = await import('../cosmos/derivation.js');
    const result = deriveCosmosAddress(TEST_MNEMONIC);
    expect(result).not.toHaveProperty('privateKey');
  });
});
