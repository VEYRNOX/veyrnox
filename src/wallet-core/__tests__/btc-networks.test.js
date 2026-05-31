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

  it('GATES mainnet until ALLOW_BTC_MAINNET is set', () => {
    expect(ALLOW_BTC_MAINNET).toBe(false);
    expect(() => getBtcNetwork('mainnet')).toThrow(/gated/i);
  });

  it('does not list mainnet among enabled networks while gated', () => {
    const keys = listEnabledBtcNetworks().map(n => n.key);
    expect(keys).toContain('testnet');
    expect(keys).toContain('signet');
    expect(keys).not.toContain('mainnet');
  });

  it('exposes mainnet info for display WITHOUT un-gating it', () => {
    // Display lookup returns the entry (for labels) but never bypasses the gate.
    expect(getBtcNetworkInfo('mainnet').addressPrefix).toBe('bc1');
    expect(() => getBtcNetwork('mainnet')).toThrow();
  });

  it('throws on an unknown network', () => {
    expect(() => getBtcNetwork('regtest')).toThrow(/unknown/i);
  });
});
