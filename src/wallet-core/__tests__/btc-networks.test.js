// wallet-core/__tests__/btc-networks.test.js
//
// The Bitcoin financial-safety gate, mirroring the EVM network-gating test:
// real BTC cannot move pre-audit. testnet/signet are enabled; mainnet throws.

import { describe, it, expect } from 'vitest';
import {
  getBtcNetwork,
  getBtcNetworkInfo,
  listEnabledBtcNetworks,
  ALLOW_BTC_MAINNET,
} from '../btc/networks.js';

describe('BTC network gating', () => {
  it('allows testnet by default (coin type 1, tb1 prefix)', () => {
    const net = getBtcNetwork('testnet');
    expect(net.isTestnet).toBe(true);
    expect(net.coinType).toBe(1);
    expect(net.addressPrefix).toBe('tb1');
  });

  it('allows signet (testnet-class)', () => {
    expect(getBtcNetwork('signet').isTestnet).toBe(true);
  });

  it('ALLOW_BTC_MAINNET is true — unlocked 2026-06-17 after owner sign-off', () => {
    expect(ALLOW_BTC_MAINNET).toBe(true);
    expect(() => getBtcNetwork('mainnet')).not.toThrow();
  });

  it('listEnabledBtcNetworks includes mainnet after unlock', () => {
    const keys = listEnabledBtcNetworks().map(n => n.key);
    expect(keys).toContain('testnet');
    expect(keys).toContain('signet');
    expect(keys).toContain('mainnet');
  });

  it('mainnet info is accessible and enabled', () => {
    expect(getBtcNetworkInfo('mainnet').addressPrefix).toBe('bc1');
    expect(getBtcNetwork('mainnet').isTestnet).toBe(false);
  });

  it('throws on an unknown network', () => {
    expect(() => getBtcNetwork('regtest')).toThrow(/unknown/i);
  });
});
