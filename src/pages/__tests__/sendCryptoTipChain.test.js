// Regression coverage for issue #1645: the Send flow was sending 'evm' as the
// TIP chain slug, which the Worker's etherscan-labels and GoPlus sources both
// skip. A Tornado Cash router send rendered as CLEAR while the Advisor path
// (which uses the same worker with 'ethereum') showed BLOCKED. This test
// locks the mapping so a rename of a network key can't silently reintroduce it.

import { describe, it, expect } from 'vitest';
import { resolveTipChain } from '../sendCryptoTipChain';

describe('resolveTipChain', () => {
  it('routes BTC and Solana to their own worker slugs', () => {
    expect(resolveTipChain('btc', undefined)).toBe('btc');
    expect(resolveTipChain('solana', undefined)).toBe('solana');
  });

  it('never returns the bare "evm" slug that skipped etherscan-labels + GoPlus', () => {
    for (const key of [
      'mainnet', 'sepolia',
      'polygon', 'polygonAmoy',
      'arbitrum', 'arbitrumSepolia',
      'optimism', 'optimismSepolia',
      'avalanche', 'avalancheFuji',
      'bnb', 'bnbTestnet',
    ]) {
      expect(resolveTipChain(null, key)).not.toBe('evm');
    }
  });

  it('maps every wallet EVM key to the worker slug the aggregator recognises', () => {
    // Worker slug set: goplus.ts CHAIN_ID keys + etherscan-labels-kv.ts 'ethereum' gate.
    expect(resolveTipChain(null, 'mainnet')).toBe('ethereum');
    expect(resolveTipChain(null, 'sepolia')).toBe('ethereum');
    expect(resolveTipChain(null, 'polygon')).toBe('polygon');
    expect(resolveTipChain(null, 'polygonAmoy')).toBe('polygon');
    expect(resolveTipChain(null, 'arbitrum')).toBe('arbitrum');
    expect(resolveTipChain(null, 'arbitrumSepolia')).toBe('arbitrum');
    expect(resolveTipChain(null, 'optimism')).toBe('optimism');
    expect(resolveTipChain(null, 'optimismSepolia')).toBe('optimism');
    expect(resolveTipChain(null, 'avalanche')).toBe('avalanche');
    expect(resolveTipChain(null, 'avalancheFuji')).toBe('avalanche');
    // BNB Smart Chain is 'bsc' on the worker, not 'bnb'.
    expect(resolveTipChain(null, 'bnb')).toBe('bsc');
    expect(resolveTipChain(null, 'bnbTestnet')).toBe('bsc');
  });

  it('falls back to ethereum for unknown EVM keys rather than the inert "evm" slug', () => {
    // Wider coverage on the worker + address-based lookups make this the
    // safer default than skipping. I4: never render CLEAR from a wrong slug.
    expect(resolveTipChain(null, 'someNewChainKey')).toBe('ethereum');
    expect(resolveTipChain(null, undefined)).toBe('ethereum');
  });
});
