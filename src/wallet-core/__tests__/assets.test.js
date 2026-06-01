// wallet-core/__tests__/assets.test.js
import { describe, it, expect } from 'vitest';
import { ASSETS, getAsset, canSend, canReceive, isEvmFamily, ASSET_STATUS } from '../assets.js';
import { getNetwork } from '../evm/networks.js';

describe('asset registry', () => {
  it('contains all 10 expected assets', () => {
    const symbols = ASSETS.map(a => a.symbol);
    expect(symbols).toEqual(['ETH','USDC','USDT','MATIC','ARB','OP','AVAX','BNB','BTC','SOL']);
  });

  it('only ETH is live (sendable) right now', () => {
    const sendable = ASSETS.filter(canSend).map(a => a.symbol);
    expect(sendable).toEqual(['ETH']);
  });

  it('USDT is receive_only ERC-20 on Sepolia — real address + balance, no send yet', () => {
    // USDT now routes through the same ERC-20 path as USDC (Aave faucet test-USDT
    // stand-in, 6 decimals — see evm/tokens.js). Receivable now; send HARD-gated.
    const usdt = getAsset('USDT');
    expect(usdt.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
    expect(usdt.family).toBe('erc20');
    expect(usdt.chain).toBe('sepolia');
    expect(canReceive(usdt)).toBe(true);
    expect(canSend(usdt)).toBe(false);
  });

  it('the coming_soon gate still blocks receive AND send (no asset is coming_soon now)', () => {
    // Capability-gate semantics must keep denying a coming_soon asset, even though
    // nothing currently sits in that state.
    const fake = { symbol: 'X', status: ASSET_STATUS.COMING_SOON };
    expect(canSend(fake)).toBe(false);
    expect(canReceive(fake)).toBe(false);
    expect(ASSETS.some(a => a.status === ASSET_STATUS.COMING_SOON)).toBe(false);
  });

  it('BTC (Phase BTC) is receive_only on testnet — real address, no send yet', () => {
    const btc = getAsset('BTC');
    expect(btc.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
    expect(btc.family).toBe('btc');
    expect(btc.chain).toBe('testnet');     // gated-aware BTC network key
    expect(canReceive(btc)).toBe(true);     // real BIP-84 address derivable
    expect(canSend(btc)).toBe(false);       // HARD-gated until a verified testnet send
  });

  it('SOL (Phase SOL) is receive_only on devnet — real ed25519 address, no send yet', () => {
    const sol = getAsset('SOL');
    expect(sol.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
    expect(sol.family).toBe('solana');
    expect(sol.chain).toBe('devnet');       // gated-aware Solana network key
    expect(canReceive(sol)).toBe(true);     // real SLIP-0010 address derivable
    expect(canSend(sol)).toBe(false);       // HARD-gated until a verified devnet send
  });

  it('classifies EVM family (incl. ERC-20) correctly', () => {
    expect(isEvmFamily(getAsset('ETH'))).toBe(true);
    expect(isEvmFamily(getAsset('USDC'))).toBe(true);
    expect(isEvmFamily(getAsset('BTC'))).toBe(false);
    expect(isEvmFamily(getAsset('SOL'))).toBe(false);
  });
});

describe('Phase C — five EVM chains reachable on testnet (receive_only, not live)', () => {
  // Each new asset points at its VERIFIED testnet network key; mainnets are gated.
  const NEW = [
    { symbol: 'MATIC', chain: 'polygonAmoy' },
    { symbol: 'ARB',   chain: 'arbitrumSepolia' },
    { symbol: 'OP',    chain: 'optimismSepolia' },
    { symbol: 'AVAX',  chain: 'avalancheFuji' },
    { symbol: 'BNB',   chain: 'bnbTestnet' },
  ];

  it('each new chain asset is receive_only on its TESTNET and EVM-family', () => {
    for (const n of NEW) {
      const a = getAsset(n.symbol);
      expect(a.chain).toBe(n.chain);          // verified testnet key, not a mainnet
      expect(a.family).toBe('evm');
      expect(isEvmFamily(a)).toBe(true);
      expect(a.status).toBe(ASSET_STATUS.RECEIVE_ONLY);
      expect(canReceive(a)).toBe(true);       // real shared address + balance reads
      expect(canSend(a)).toBe(false);         // HARD-gated until a verified transfer
    }
  });

  it('NONE of the new assets were flipped to live (ETH stays the only sendable)', () => {
    const sendable = ASSETS.filter(canSend).map(a => a.symbol);
    expect(sendable).toEqual(['ETH']);
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
