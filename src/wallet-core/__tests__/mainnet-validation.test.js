// wallet-core/__tests__/mainnet-validation.test.js
//
// Confidence test: all 6 EVM mainnet networks are properly accessible after
// the 2026-06-17 owner sign-off (ALLOW_MAINNET = true, all enabled: true).
//
// The chainId/symbol values here ARE the security fixture — they were verified
// against the authoritative ethereum-lists/chains registry before mainnet was
// unlocked. A wrong chainId is consensus-critical (replay / wrong-network send).
// Any edit to these values must be re-verified against the registry.

import { describe, it, expect } from 'vitest';
import {
  getNetwork,
  listEnabledNetworks,
  ALLOW_MAINNET,
} from '../evm/networks.js';
import { ALLOW_BTC_MAINNET } from '../btc/networks.js';
import { ALLOW_SOL_MAINNET } from '../sol/networks.js';

// Canonical mainnet entries — chainId/symbol verified against ethereum-lists.
const EVM_MAINNETS = [
  { key: 'mainnet',   chainId: 1,     symbol: 'ETH',  explorer: 'https://etherscan.io' },
  { key: 'polygon',   chainId: 137,   symbol: 'POL',  explorer: 'https://polygonscan.com' },
  { key: 'arbitrum',  chainId: 42161, symbol: 'ETH',  explorer: 'https://arbiscan.io' },
  { key: 'optimism',  chainId: 10,    symbol: 'ETH',  explorer: 'https://optimistic.etherscan.io' },
  { key: 'avalanche', chainId: 43114, symbol: 'AVAX', explorer: 'https://snowtrace.io' },
  { key: 'bnb',       chainId: 56,    symbol: 'BNB',  explorer: 'https://bscscan.com' },
];

describe('mainnet unlocked — 2026-06-17 owner sign-off', () => {
  it('all three master switches are true', () => {
    expect(ALLOW_MAINNET).toBe(true);
    expect(ALLOW_BTC_MAINNET).toBe(true);
    expect(ALLOW_SOL_MAINNET).toBe(true);
  });

  it('getNetwork() resolves all 6 EVM mainnets without throwing', () => {
    for (const m of EVM_MAINNETS) {
      expect(() => getNetwork(m.key)).not.toThrow();
    }
  });

  it('every EVM mainnet has the verified chainId (consensus-critical — not guessed)', () => {
    for (const m of EVM_MAINNETS) {
      const net = getNetwork(m.key);
      expect(net.chainId, `${m.key} chainId`).toBe(m.chainId);
    }
  });

  it('every EVM mainnet has the correct native gas symbol (no hardcoded ETH)', () => {
    for (const m of EVM_MAINNETS) {
      const net = getNetwork(m.key);
      expect(net.symbol, `${m.key} symbol`).toBe(m.symbol);
    }
  });

  it('every EVM mainnet has an HTTPS RPC and a block explorer URL', () => {
    for (const m of EVM_MAINNETS) {
      const net = getNetwork(m.key);
      expect(net.defaultRpcUrl, `${m.key} rpc`).toMatch(/^https:\/\//);
      expect(net.explorer, `${m.key} explorer`).toBe(m.explorer);
    }
  });

  it('every EVM mainnet is marked enabled and isTestnet:false', () => {
    for (const m of EVM_MAINNETS) {
      const net = getNetwork(m.key);
      expect(net.enabled, `${m.key} enabled`).toBe(true);
      expect(net.isTestnet, `${m.key} isTestnet`).toBe(false);
    }
  });

  it('listEnabledNetworks() now includes all 6 mainnet keys', () => {
    const keys = listEnabledNetworks().map(n => n.key);
    for (const m of EVM_MAINNETS) {
      expect(keys, `${m.key} in enabled list`).toContain(m.key);
    }
  });

  it('chainIds are unique across the entire registry (no accidental collisions)', () => {
    const nets = listEnabledNetworks();
    const ids = nets.map(n => n.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
