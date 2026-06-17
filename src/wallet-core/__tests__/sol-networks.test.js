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
  it('ALLOW_SOL_MAINNET is true — unlocked 2026-06-17 after owner sign-off', () => {
    expect(ALLOW_SOL_MAINNET).toBe(true);
  });

  it('devnet and testnet are enabled and resolvable', () => {
    expect(getSolNetwork('devnet').cluster).toBe('devnet');
    expect(getSolNetwork('testnet').cluster).toBe('testnet');
  });

  it('getSolNetwork resolves mainnet now that ALLOW_SOL_MAINNET is true', () => {
    expect(() => getSolNetwork('mainnet')).not.toThrow();
    expect(getSolNetwork('mainnet').cluster).toBe('mainnet-beta');
  });

  it('getSolNetwork throws for an unknown network', () => {
    expect(() => getSolNetwork('solanaX')).toThrow(/Unknown/i);
  });

  it('display-only lookup returns mainnet info with enabled:true', () => {
    const info = getSolNetworkInfo('mainnet');
    expect(info.cluster).toBe('mainnet-beta');
    expect(info.enabled).toBe(true);
  });

  it('listEnabledSolNetworks includes mainnet after unlock', () => {
    const keys = listEnabledSolNetworks().map(n => n.key);
    expect(keys).toContain('devnet');
    expect(keys).toContain('testnet');
    expect(keys).toContain('mainnet');
  });

  it('explorer URLs carry the cluster query for devnet/testnet', () => {
    expect(solExplorerUrl('devnet', 'tx', 'SIG')).toBe('https://explorer.solana.com/tx/SIG?cluster=devnet');
    expect(solExplorerUrl('testnet', 'address', 'ADDR')).toBe('https://explorer.solana.com/address/ADDR?cluster=testnet');
  });
});
