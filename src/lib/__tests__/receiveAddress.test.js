// Tests for the receive-address resolver — the fund-safety mapping of an asset to
// the CORRECT chain address pulled from the WalletProvider's derived accounts.

import { describe, it, expect } from 'vitest';
import { resolveReceive } from '@/lib/receiveAddress';

// Distinct, format-plausible addresses so a mix-up (showing the EVM address for
// BTC, etc.) would be caught by the assertions below.
const EVM = '0xAbC0000000000000000000000000000000000001';
const BTC = 'tb1qexampleexampleexampleexampleexampleq8n2';
const SOL = 'So1anaBase58AddrExampleExampleExampleExampl';

const wallet = {
  accounts: [{ address: EVM, path: "m/44'/60'/0'/0/0", index: 0 }],
  btcAccount: { address: BTC, path: "m/84'/1'/0'/0/0", networkKey: 'testnet' },
  solAccount: { address: SOL, path: "m/44'/501'/0'/0'", networkKey: 'devnet' },
};

describe('resolveReceive — per-chain address correctness', () => {
  it('ETH (native EVM) → shared EVM address on Sepolia Testnet', () => {
    const r = resolveReceive('ETH', wallet);
    expect(r.address).toBe(EVM);
    expect(r.family).toBe('evm');
    expect(r.isErc20).toBe(false);
    expect(r.network.name).toMatch(/Sepolia/i);
  });

  it('every EVM chain shares the SAME EVM address (label differs, address does not)', () => {
    for (const sym of ['ETH', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB']) {
      const r = resolveReceive(sym, wallet);
      expect(r.address).toBe(EVM); // same secp256k1 account on every EVM chain
    }
    // ...but the network labels are distinct so the user sees which chain it is.
    const names = ['ETH', 'MATIC', 'ARB', 'OP', 'AVAX', 'BNB']
      .map((s) => resolveReceive(s, wallet).network.name);
    expect(new Set(names).size).toBe(6);
  });

  it('USDC (ERC-20) → SAME EVM address, flagged as a token', () => {
    const r = resolveReceive('USDC', wallet);
    expect(r.address).toBe(EVM);
    expect(r.isErc20).toBe(true);
    expect(r.receivable).toBe(true);
    expect(r.network.name).toMatch(/Sepolia/i);
  });

  it('BTC → bech32 address, NOT the EVM address', () => {
    const r = resolveReceive('BTC', wallet);
    expect(r.address).toBe(BTC);
    expect(r.address).not.toBe(EVM);
    expect(r.family).toBe('btc');
    expect(r.network.name).toMatch(/Bitcoin Testnet/i);
  });

  it('SOL → base58 address, NOT the EVM/BTC address', () => {
    const r = resolveReceive('SOL', wallet);
    expect(r.address).toBe(SOL);
    expect(r.address).not.toBe(EVM);
    expect(r.address).not.toBe(BTC);
    expect(r.family).toBe('solana');
    expect(r.network.name).toMatch(/Solana Devnet/i);
  });

  it('USDT (ERC-20) → SAME EVM address as USDC, flagged as a token, receivable', () => {
    const r = resolveReceive('USDT', wallet);
    expect(r.address).toBe(EVM); // shares the one secp256k1 EVM account
    expect(r.isErc20).toBe(true);
    expect(r.receivable).toBe(true);
    expect(r.network.name).toMatch(/Sepolia/i);
  });

  it('locked wallet (no derived accounts) yields null address but keeps the label', () => {
    const locked = { accounts: [], btcAccount: null, solAccount: null };
    for (const sym of ['ETH', 'USDC', 'BTC', 'SOL']) {
      const r = resolveReceive(sym, locked);
      expect(r.address).toBeNull();
      expect(r.network).not.toBeNull(); // network label is known even while locked
    }
  });

  it('unknown symbol → null', () => {
    expect(resolveReceive('NOPE', wallet)).toBeNull();
  });
});
