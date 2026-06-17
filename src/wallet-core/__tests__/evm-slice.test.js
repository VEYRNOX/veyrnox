// wallet-core/__tests__/evm-slice.test.js
//
// Tests for the EVM slice's safety-critical behavior that does NOT require
// network access: mainnet gating and the vault-store plaintext guard.
// (Live send/balance tests require a Sepolia RPC and run in your environment.)

import { describe, it, expect } from 'vitest';
import { getNetwork, listEnabledNetworks, ALLOW_MAINNET } from '../evm/networks.js';

describe('network gating', () => {
  it('allows sepolia (testnet) by default', () => {
    const net = getNetwork('sepolia');
    expect(net.chainId).toBe(11155111);
    expect(net.isTestnet).toBe(true);
  });

  it('ALLOW_MAINNET is true — unlocked 2026-06-17 after owner sign-off', () => {
    expect(ALLOW_MAINNET).toBe(true);
    expect(() => getNetwork('mainnet')).not.toThrow();
  });

  it('lists mainnet among enabled networks after unlock', () => {
    const keys = listEnabledNetworks().map(n => n.key);
    expect(keys).toContain('sepolia');
    expect(keys).toContain('mainnet');
  });
});

describe('vault store plaintext guard', () => {
  it('refuses to persist a non-encrypted object', async () => {
    // Import lazily so jsdom/indexeddb isn't required unless this test runs.
    const { saveVault } = await import('../evm/vaultStore.js');
    await expect(saveVault({ mnemonic: 'do not store me' })).rejects.toThrow(/encrypted vault blob/i);
  });
});
