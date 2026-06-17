// wallet-core/__tests__/networks.test.js
//
// Phase C (additional EVM chains) safety-critical, network-free tests:
//   - every chainId matches the value VERIFIED against the authoritative
//     ethereum-lists/chains registry (a wrong chainId is consensus-critical)
//   - testnets are enabled; mainnets are present but GATED (enabled:false and
//     blocked by ALLOW_MAINNET)
//   - the per-chain native gas symbol is correct (no hardcoded "ETH")
//
// The values below are the verification fixture: if a chainId/symbol is ever
// changed in networks.js it must be re-verified against the registry and this
// fixture updated deliberately — the test is the tripwire against a silent edit.

import { describe, it, expect } from 'vitest';
import {
  NETWORKS,
  getNetwork,
  getNetworkInfo,
  listEnabledNetworks,
  ALLOW_MAINNET,
} from '../evm/networks.js';

// Verified against https://chainid.network (ethereum-lists/chains, eip155-<id>.json).
const TESTNETS = [
  { key: 'sepolia',         chainId: 11155111, symbol: 'ETH' },
  { key: 'polygonAmoy',     chainId: 80002,    symbol: 'POL' },
  { key: 'arbitrumSepolia', chainId: 421614,   symbol: 'ETH' },
  { key: 'optimismSepolia', chainId: 11155420, symbol: 'ETH' },
  { key: 'avalancheFuji',   chainId: 43113,    symbol: 'AVAX' },
  { key: 'bnbTestnet',      chainId: 97,       symbol: 'tBNB' },
];

const MAINNETS = [
  { key: 'mainnet',   chainId: 1,     symbol: 'ETH' },
  { key: 'polygon',   chainId: 137,   symbol: 'POL' },
  { key: 'arbitrum',  chainId: 42161, symbol: 'ETH' },
  { key: 'optimism',  chainId: 10,    symbol: 'ETH' },
  { key: 'avalanche', chainId: 43114, symbol: 'AVAX' },
  { key: 'bnb',       chainId: 56,    symbol: 'BNB' },
];

describe('Phase C network registry — chainIds verified, not guessed', () => {
  it('every testnet has the verified chainId/symbol, 18 decimals, and is enabled', () => {
    for (const t of TESTNETS) {
      const net = getNetwork(t.key); // enabled testnets resolve through the gate
      expect(net.chainId).toBe(t.chainId);
      expect(net.symbol).toBe(t.symbol);
      expect(net.decimals).toBe(18);
      expect(net.isTestnet).toBe(true);
      expect(net.enabled).toBe(true);
      expect(typeof net.defaultRpcUrl).toBe('string');
      expect(net.defaultRpcUrl).toMatch(/^https:\/\//);
      expect(net.explorer).toMatch(/^https:\/\//);
    }
  });

  it('every chainId is unique across the whole registry (no accidental dupes)', () => {
    const ids = Object.values(NETWORKS).map(n => n.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the CORRECT native gas symbol per chain — never a hardcoded ETH', () => {
    // Non-ETH gas chains must NOT report ETH.
    expect(getNetworkInfo('polygonAmoy').symbol).toBe('POL');
    expect(getNetworkInfo('avalancheFuji').symbol).toBe('AVAX');
    expect(getNetworkInfo('bnbTestnet').symbol).toBe('tBNB');
    // L2s genuinely pay gas in ETH — the lookup must reflect reality, not assume.
    expect(getNetworkInfo('arbitrumSepolia').symbol).toBe('ETH');
    expect(getNetworkInfo('optimismSepolia').symbol).toBe('ETH');
  });

  it('getNetworkInfo is display-only and does NOT throw for gated mainnets', () => {
    // Unlike getNetwork(), the info lookup never enforces the gate (UI labels).
    expect(getNetworkInfo('polygon').symbol).toBe('POL');
    expect(getNetworkInfo('nope')).toBeNull();
  });
});

describe('Phase C mainnet — unlocked 2026-06-17 after owner sign-off', () => {
  it('ALLOW_MAINNET is true (owner sign-off 2026-06-17, internal audit complete)', () => {
    expect(ALLOW_MAINNET).toBe(true);
  });

  it('registers every mainnet with the verified chainId and enabled:true', () => {
    for (const m of MAINNETS) {
      const raw = getNetworkInfo(m.key);
      expect(raw).not.toBeNull();
      expect(raw.chainId).toBe(m.chainId);
      expect(raw.symbol).toBe(m.symbol);
      expect(raw.isTestnet).toBe(false);
      expect(raw.enabled).toBe(true);
    }
  });

  it('getNetwork() resolves every mainnet key without throwing', () => {
    for (const m of MAINNETS) {
      expect(() => getNetwork(m.key)).not.toThrow();
      const net = getNetwork(m.key);
      expect(net.chainId).toBe(m.chainId);
      expect(net.symbol).toBe(m.symbol);
    }
  });

  it('listEnabledNetworks() returns all testnets AND all mainnets', () => {
    const keys = listEnabledNetworks().map(n => n.key);
    for (const t of TESTNETS) expect(keys).toContain(t.key);
    for (const m of MAINNETS) expect(keys).toContain(m.key);
  });
});
