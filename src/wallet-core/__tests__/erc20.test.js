// wallet-core/__tests__/erc20.test.js
//
// Phase B (ERC-20) safety-critical, network-free tests:
//   - registry guard refuses unconfigured/unverified token addresses
//   - calldata decode surfaces transfer/approve + flags UNLIMITED approvals
//   - amount scaling uses exact base units (parseUnits), correct at boundaries
//   - asset status: USDC + USDT both receive_only (read, no send yet)
// Live balance/transfer behavior needs a Sepolia RPC and is covered separately.

import { describe, it, expect } from 'vitest';
import { Interface, parseUnits, MaxUint256 } from 'ethers';
import { getToken, isTokenConfigured, ERC20_ABI, TOKENS } from '../evm/tokens.js';
import { buildTokenTransfer, sendToken } from '../evm/token-send.js';
import { describeErc20Call } from '../evm/calldata.js';
import { getAsset, canSend, canReceive } from '../assets.js';

const iface = new Interface(ERC20_ABI);
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SPENDER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('token registry guard', () => {
  it('returns the verified USDC entry (6 decimals)', () => {
    const t = getToken('sepolia', 'USDC');
    expect(t.decimals).toBe(6);
    expect(/^0x[0-9a-fA-F]{40}$/.test(t.address)).toBe(true);
  });

  it('returns the verified USDT entry (6 decimals, configured stand-in)', () => {
    // USDT now routes through the same ERC-20 path as USDC, using the Aave faucet
    // test-USDT stand-in. Critically it is 6 decimals (NOT 18) — wrong decimals
    // would scale every amount by 10^12.
    const t = getToken('sepolia', 'USDT');
    expect(t.decimals).toBe(6);
    expect(/^0x[0-9a-fA-F]{40}$/.test(t.address)).toBe(true);
    expect(isTokenConfigured('sepolia', 'USDC')).toBe(true);
    expect(isTokenConfigured('sepolia', 'USDT')).toBe(true);
  });

  it('throws on an unknown token (registry guard refuses anything unverified)', () => {
    expect(() => getToken('sepolia', 'NOPE')).toThrow(/unknown token/i);
    expect(isTokenConfigured('sepolia', 'NOPE')).toBe(false);
  });

  it('does not register any mainnet tokens (testnet-only until audit)', () => {
    expect(TOKENS.mainnet).toBeUndefined();
  });

  it('sendToken refuses any token not in the verified registry (no signing)', async () => {
    await expect(
      sendToken({ networkKey: 'sepolia', privateKey: '0x' + '1'.repeat(64), symbol: 'NOPE', to: RECIPIENT, amount: '1' })
    ).rejects.toThrow(/unknown token/i);
  });
});

describe('calldata decode + approval guard', () => {
  it('decodes a transfer with the correct recipient and amount', () => {
    const { data } = buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: RECIPIENT, amount: '12.5' });
    const d = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    expect(d.kind).toBe('transfer');
    expect(d.to.toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(d.amount).toBe('12.5');
    expect(d.tokenSymbol).toBe('USDC');
  });

  it('decodes an exact-amount approve WITHOUT a warning', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, parseUnits('100', 6)]);
    const d = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    expect(d.kind).toBe('approve');
    expect(d.unlimited).toBe(false);
    expect(d.amount).toBe('100.0');
    expect(d.warning).toBeNull();
  });

  it('flags an UNLIMITED approve (MaxUint256) with a warning', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, MaxUint256]);
    const d = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    expect(d.kind).toBe('approve');
    expect(d.unlimited).toBe(true);
    expect(d.amount).toBe('UNLIMITED');
    expect(d.warning).toMatch(/UNLIMITED/);
  });

  it('flags the common 2^256-1 unlimited pattern too', () => {
    const data = iface.encodeFunctionData('approve', [SPENDER, (1n << 256n) - 1n]);
    const d = describeErc20Call({ data, tokenSymbol: 'USDC', decimals: 6 });
    expect(d.unlimited).toBe(true);
  });

  it('returns kind=unknown for undecodable calldata (UI must refuse, not crash)', () => {
    const d = describeErc20Call({ data: '0xdeadbeef', tokenSymbol: 'USDC', decimals: 6 });
    expect(d.kind).toBe('unknown');
  });
});

describe('amount scaling (exact base units, no float)', () => {
  it('scales the smallest USDC unit (0.000001 -> 1 base unit)', () => {
    const { value } = buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: RECIPIENT, amount: '0.000001' });
    expect(value).toBe(1n);
  });

  it('scales 1.5 USDC to 1_500_000 base units', () => {
    const { value } = buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: RECIPIENT, amount: '1.5' });
    expect(value).toBe(1_500_000n);
  });

  it('scales USDT at 6 decimals (1.5 -> 1_500_000), NOT 18 — guards the 10^12 bug', () => {
    const { value, token } = buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDT', to: RECIPIENT, amount: '1.5' });
    expect(token.decimals).toBe(6);
    expect(value).toBe(1_500_000n); // 1.5 * 10^6; an 18-decimal bug would give 1.5e18
  });

  it('handles large amounts without precision loss', () => {
    const { value } = buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: RECIPIENT, amount: '1000000.123456' });
    expect(value).toBe(parseUnits('1000000.123456', 6));
  });

  it('rejects more precision than the token supports', () => {
    expect(() =>
      buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: RECIPIENT, amount: '0.0000001' })
    ).toThrow();
  });

  it('rejects an invalid recipient address', () => {
    expect(() =>
      buildTokenTransfer({ networkKey: 'sepolia', symbol: 'USDC', to: 'not-an-address', amount: '1' })
    ).toThrow(/invalid recipient/i);
  });
});

describe('asset status gating (Phase B)', () => {
  it('USDC is receive_only: can receive/show balance, cannot send yet', () => {
    const usdc = getAsset('USDC');
    expect(usdc.status).toBe('receive_only');
    expect(canReceive(usdc)).toBe(true);
    expect(canSend(usdc)).toBe(false);
  });

  it('USDT is now receive_only: can receive/show balance, cannot send yet', () => {
    const usdt = getAsset('USDT');
    expect(usdt.status).toBe('receive_only');
    expect(canReceive(usdt)).toBe(true);
    expect(canSend(usdt)).toBe(false); // HARD-gated until a verified testnet send
  });

  it('the ERC-20s stay receive_only — the live set is the verified natives (ETH, ARB, OP, BTC, SOL)', () => {
    expect(ASSETS_LIVE()).toEqual(['ETH', 'ARB', 'OP', 'BTC', 'SOL']);
  });
});

// Local helper kept at the bottom to avoid importing ASSETS just for one check.
import { ASSETS } from '../assets.js';
function ASSETS_LIVE() {
  return ASSETS.filter(canSend).map(a => a.symbol);
}
