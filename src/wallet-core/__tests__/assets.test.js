// wallet-core/__tests__/assets.test.js
import { describe, it, expect } from 'vitest';
import { ASSETS, getAsset, canSend, canReceive, isEvmFamily, ASSET_STATUS } from '../assets.js';
import { getNetwork } from '../evm/networks.js';

describe('asset registry', () => {
  it('contains all 10 expected assets', () => {
    const symbols = ASSETS.map(a => a.symbol);
    expect(symbols).toEqual(['ETH','USDC','USDT','MATIC','ARB','OP','AVAX','BNB','BTC','SOL']);
  });

  it('the live (sendable) set is ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB, BTC, SOL — each UI-verified on-chain', () => {
    const sendable = ASSETS.filter(canSend).map(a => a.symbol);
    expect(sendable).toEqual(['ETH', 'USDC', 'USDT', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB', 'BTC', 'SOL']);
  });

  it('USDT is LIVE ERC-20 on Sepolia — UI-path send verified on-chain', () => {
    // USDT routes through the same ERC-20 path as USDC (Aave faucet test-USDT
    // stand-in, 6 decimals — see evm/tokens.js). Flipped to live after a real
    // UI-path testnet transfer confirmed on-chain (tx 0x3168e4…, block 11075008).
    const usdt = getAsset('USDT');
    expect(usdt.status).toBe(ASSET_STATUS.LIVE);
    expect(usdt.family).toBe('erc20');
    expect(usdt.chain).toBe('sepolia');
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

  it('BTC (Phase BTC) is LIVE on testnet — UI-path send verified on-chain', () => {
    const btc = getAsset('BTC');
    expect(btc.status).toBe(ASSET_STATUS.LIVE); // flipped after a real UI-path testnet send
    expect(btc.family).toBe('btc');
    expect(btc.chain).toBe('testnet');     // gated-aware BTC network key (mainnet still gated)
    expect(canReceive(btc)).toBe(true);     // real BIP-84 address derivable
    expect(canSend(btc)).toBe(true);        // verified: tx 2da87a27…, block 4990901
  });

  it('SOL (Phase SOL) is LIVE on devnet — UI-path send verified on-chain', () => {
    const sol = getAsset('SOL');
    expect(sol.status).toBe(ASSET_STATUS.LIVE); // flipped after a real UI-path devnet send
    expect(sol.family).toBe('solana');
    expect(sol.chain).toBe('devnet');       // gated-aware Solana network key (mainnet still gated)
    expect(canReceive(sol)).toBe(true);     // real SLIP-0010 address derivable
    expect(canSend(sol)).toBe(true);        // verified: sig 5KGXAGTJ…, finalized
  });

  it('classifies EVM family (incl. ERC-20) correctly', () => {
    expect(isEvmFamily(getAsset('ETH'))).toBe(true);
    expect(isEvmFamily(getAsset('USDC'))).toBe(true);
    expect(isEvmFamily(getAsset('BTC'))).toBe(false);
    expect(isEvmFamily(getAsset('SOL'))).toBe(false);
  });
});

describe('Phase C — five EVM chains reachable on testnet (MATIC/ARB/OP/BNB/AVAX all now live)', () => {
  // Each new asset points at its VERIFIED testnet network key; mainnets are gated.
  // MATIC, ARB, OP, BNB and AVAX have each earned `live` via a real explorer-confirmed
  // UI-path send (see assets.js). AVAX was the last — verified on Avalanche Fuji
  // (tx 0x675e75c9…, block 56411588) once a funded test account became available; its
  // Fuji RPC was also repointed to publicnode so the browser CSP no longer blocks it.
  const VERIFIED_LIVE = [
    { symbol: 'MATIC', chain: 'polygonAmoy' },
    { symbol: 'ARB', chain: 'arbitrumSepolia' },
    { symbol: 'OP',  chain: 'optimismSepolia' },
    { symbol: 'BNB', chain: 'bnbTestnet' },
    { symbol: 'AVAX', chain: 'avalancheFuji' },
  ];

  it('no Phase C EVM chain asset is left receive_only — all are verified-live', () => {
    const evmReceiveOnly = ASSETS.filter(
      (a) => a.family === 'evm' && a.status === ASSET_STATUS.RECEIVE_ONLY,
    );
    expect(evmReceiveOnly).toHaveLength(0);
  });

  it('MATIC, ARB, OP, BNB and AVAX are live on their TESTNET after a verified UI-path send', () => {
    for (const n of VERIFIED_LIVE) {
      const a = getAsset(n.symbol);
      expect(a.chain).toBe(n.chain);
      expect(a.family).toBe('evm');
      expect(a.status).toBe(ASSET_STATUS.LIVE);
      expect(canSend(a)).toBe(true);
      expect(canReceive(a)).toBe(true);
    }
  });

  it('only the verified assets are sendable (ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB, BTC, SOL); the rest are not', () => {
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
