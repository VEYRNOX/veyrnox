// wallet-core/__tests__/sol-networks.test.js
//
// The mainnet gate is the financial-safety invariant: real SOL cannot move until
// ALLOW_SOL_MAINNET is deliberately flipped (after audit + a verified devnet
// send). Mirrors the BTC/EVM gate tests.

import { describe, it, expect } from 'vitest';
import {
  getSolNetwork,
  getSolNetworkInfo,
  listEnabledSolNetworks,
  solExplorerUrl,
  ALLOW_SOL_MAINNET,
} from '../sol/networks.js';

describe('Solana network gate', () => {
  it('ships with mainnet GATED', () => {
    expect(ALLOW_SOL_MAINNET).toBe(false);
  });

  it('devnet and testnet are enabled and resolvable', () => {
    expect(getSolNetwork('devnet').cluster).toBe('devnet');
    expect(getSolNetwork('testnet').cluster).toBe('testnet');
  });

  it('getSolNetwork throws for the gated mainnet', () => {
    expect(() => getSolNetwork('mainnet')).toThrow(/gated/i);
  });

  it('getSolNetwork throws for an unknown network', () => {
    expect(() => getSolNetwork('solanaX')).toThrow(/Unknown/i);
  });

  it('display-only lookup returns mainnet info WITHOUT enabling it', () => {
    const info = getSolNetworkInfo('mainnet');
    expect(info.cluster).toBe('mainnet-beta');
    expect(info.enabled).toBe(false);
  });

  it('listEnabledSolNetworks excludes the gated mainnet', () => {
    const keys = listEnabledSolNetworks().map(n => n.key);
    expect(keys).toContain('devnet');
    expect(keys).toContain('testnet');
    expect(keys).not.toContain('mainnet');
  });

  it('explorer URLs carry the cluster query for devnet/testnet', () => {
    expect(solExplorerUrl('devnet', 'tx', 'SIG')).toBe('https://explorer.solana.com/tx/SIG?cluster=devnet');
    expect(solExplorerUrl('testnet', 'address', 'ADDR')).toBe('https://explorer.solana.com/address/ADDR?cluster=testnet');
  });
});
