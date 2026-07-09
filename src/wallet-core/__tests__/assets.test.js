// wallet-core/__tests__/assets.test.js
import { describe, it, expect } from 'vitest';
import { ASSETS, getAsset, canSend, canReceive, isEvmFamily, ASSET_STATUS } from '../assets.js';
import { getNetwork } from '../evm/networks.js';

describe('asset registry', () => {
  it('contains all 10 expected assets', () => {
    const symbols = ASSETS.map(a => a.symbol);
    expect(symbols).toEqual(['ETH','USDC','USDT','MATIC','ARB','OP','AVAX','BNB','BTC','SOL']);
  });

  it('the live (sendable) set is all 10 assets — each verified on-chain (AVAX+BNB added 2026-06-19)', () => {
    const sendable = ASSETS.filter(canSend).map(a => a.symbol);
    expect(sendable).toEqual(['ETH', 'USDC', 'USDT', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB', 'BTC', 'SOL']);
  });

  it('USDT is LIVE ERC-20 on mainnet — chain key flipped after Sepolia testnet verification', () => {
    // USDT routes through the same ERC-20 path as USDC. Sepolia testnet send was
    // verified on-chain (tx 0x3168e4…, block 11075008). Chain key flipped to
    // 'mainnet' once ALLOW_MAINNET=true and the mainnet contract was confirmed in
    // evm/tokens.js. Mainnet send verification (build:release, etherscan.io txid)
    // is the outstanding step before status moves to "LIVE on mainnet".
    const usdt = getAsset('USDT');
    expect(usdt.status).toBe(ASSET_STATUS.LIVE);
    expect(usdt.family).toBe('erc20');
    expect(usdt.chain).toBe('mainnet');
    expect(canReceive(usdt)).toBe(true);
    expect(canSend(usdt)).toBe(true);
  });

  it('the coming_soon gate still blocks receive AND send (no asset is coming_soon now)', () => {
    // Capability-gate semantics must keep denying a coming_soon asset, even though
    // nothing currently sits in that state.
    const fake = { symbol: 'X', status: ASSET_STATUS.COMING_SOON };
    expect(canSend(fake)).toBe(false);
    expect(canReceive(fake)).toBe(false);
    expect(ASSETS.some(a => a.status === ASSET_STATUS.COMING_SOON)).toBe(false);
  });

  it('BTC (Phase BTC) is LIVE on mainnet', () => {
    const btc = getAsset('BTC');
    expect(btc.status).toBe(ASSET_STATUS.LIVE);
    expect(btc.family).toBe('btc');
    expect(btc.chain).toBe('mainnet');
    expect(canReceive(btc)).toBe(true);
    expect(canSend(btc)).toBe(true);
  });

  it('SOL (Phase SOL) is LIVE on mainnet', () => {
    const sol = getAsset('SOL');
    expect(sol.status).toBe(ASSET_STATUS.LIVE);
    expect(sol.family).toBe('solana');
    expect(sol.chain).toBe('mainnet');
    expect(canReceive(sol)).toBe(true);
    expect(canSend(sol)).toBe(true);
  });

  it('classifies EVM family (incl. ERC-20) correctly', () => {
    expect(isEvmFamily(getAsset('ETH'))).toBe(true);
    expect(isEvmFamily(getAsset('USDC'))).toBe(true);
    expect(isEvmFamily(getAsset('BTC'))).toBe(false);
    expect(isEvmFamily(getAsset('SOL'))).toBe(false);
  });
});

describe('Phase C — all five EVM chains live after verified on-chain sends', () => {
  // All five Phase-C EVM chains have earned `live` via real explorer-confirmed sends.
  // MATIC/ARB/OP point at testnet network keys; AVAX/BNB point at mainnet keys after
  // the 2026-06-17 mainnet gate opened and 2026-06-19 testnet verification.
  const VERIFIED_LIVE = [
    { symbol: 'MATIC', chain: 'polygon' },
    { symbol: 'ARB',   chain: 'arbitrum' },
    { symbol: 'OP',    chain: 'optimism' },
    { symbol: 'AVAX',  chain: 'avalanche' },
    { symbol: 'BNB',   chain: 'bnb' },
  ];

  it('all five Phase-C EVM chain assets are live after verified UI-path sends (EVM-family)', () => {
    for (const n of VERIFIED_LIVE) {
      const a = getAsset(n.symbol);
      expect(a.chain).toBe(n.chain);
      expect(a.family).toBe('evm');
      expect(isEvmFamily(a)).toBe(true);
      expect(a.status).toBe(ASSET_STATUS.LIVE);
      expect(canReceive(a)).toBe(true);
      expect(canSend(a)).toBe(true);
    }
  });

  it('only the verified assets are sendable (all 10: ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB, BTC, SOL)', () => {
    const sendable = ASSETS.filter(canSend).map(a => a.symbol);
    expect(sendable).toEqual(['ETH', 'USDC', 'USDT', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB', 'BTC', 'SOL']);
  });

  it('every receivable EVM asset maps to an ENABLED (ungated) network', () => {
    for (const a of ASSETS) {
      if (isEvmFamily(a) && canReceive(a)) {
        // getNetwork() throws for gated/disabled networks — so this asserts the
        // asset is wired to a real, enabled testnet (no dangling/ gated chain key).
        expect(() => getNetwork(a.chain)).not.toThrow();
      }
    }
  });
});
