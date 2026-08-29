// Regression tests for the Strix 2026-08-29 finding: WalletConnect approval
// modal must render the ERC-20 recipient AND flag non-registry tokens.
import { describe, it, expect } from 'vitest';
import { Interface } from 'ethers';
import { describeWcTokenTransfer, lookupRegistryToken } from '../tokenTransfer.js';

const iface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

const MAINNET_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DRAINER = '0x2222222222222222222222222222222222222222';
const RANDOM_TOKEN = '0x1111111111111111111111111111111111111111';

describe('describeWcTokenTransfer', () => {
  it('decodes a registry USDC transfer with amount + recipient', () => {
    const data = iface.encodeFunctionData('transfer', [DRAINER, 1_000_000_000_000n]); // 1,000,000 USDC (6dp)
    const out = describeWcTokenTransfer({ to: MAINNET_USDC, data }, 'mainnet');
    expect(out).not.toBeNull();
    expect(out.kind).toBe('transfer');
    expect(out.recipient.toLowerCase()).toBe(DRAINER.toLowerCase());
    expect(out.isRegistryToken).toBe(true);
    expect(out.symbol).toBe('USDC');
    expect(out.amountText).toBe('1000000.0');
  });

  it('flags non-registry tokens (recipient still returned, amount unreadable)', () => {
    const data = iface.encodeFunctionData('transfer', [DRAINER, 42n]);
    const out = describeWcTokenTransfer({ to: RANDOM_TOKEN, data }, 'mainnet');
    expect(out).not.toBeNull();
    expect(out.isRegistryToken).toBe(false);
    expect(out.recipient.toLowerCase()).toBe(DRAINER.toLowerCase());
    expect(out.symbol).toBeNull();
    expect(out.amountText).toBeNull();
  });

  it('decodes transferFrom recipient (the middle arg), not the from address', () => {
    const spender = '0x3333333333333333333333333333333333333333';
    const data = iface.encodeFunctionData('transferFrom', [spender, DRAINER, 5n]);
    const out = describeWcTokenTransfer({ to: MAINNET_USDC, data }, 'mainnet');
    expect(out.kind).toBe('transferFrom');
    expect(out.from.toLowerCase()).toBe(spender.toLowerCase());
    expect(out.recipient.toLowerCase()).toBe(DRAINER.toLowerCase());
  });

  it('returns null for native ETH sends (no data)', () => {
    expect(describeWcTokenTransfer({ to: DRAINER, data: '0x' }, 'mainnet')).toBeNull();
    expect(describeWcTokenTransfer({ to: DRAINER }, 'mainnet')).toBeNull();
  });

  it('returns null for unrecognised selectors', () => {
    expect(describeWcTokenTransfer({ to: MAINNET_USDC, data: '0xdeadbeef' + '00'.repeat(64) }, 'mainnet')).toBeNull();
  });

  it('refuses malformed calldata (short body)', () => {
    expect(describeWcTokenTransfer({ to: MAINNET_USDC, data: '0xa9059cbb' + '00'.repeat(20) }, 'mainnet')).toBeNull();
  });

  it('refuses address words with dirty top bytes', () => {
    // 0xa9059cbb + a "to" word with non-zero high bytes + a valid amount word
    const dirtyTo = 'ff'.repeat(12) + '22'.repeat(20);
    const amt = '00'.repeat(31) + '2a';
    expect(describeWcTokenTransfer({ to: MAINNET_USDC, data: '0xa9059cbb' + dirtyTo + amt }, 'mainnet')).toBeNull();
  });
});

describe('lookupRegistryToken', () => {
  it('matches case-insensitively', () => {
    expect(lookupRegistryToken('mainnet', MAINNET_USDC.toLowerCase())?.symbol).toBe('USDC');
    expect(lookupRegistryToken('mainnet', MAINNET_USDC.toUpperCase().replace('0X', '0x'))?.symbol).toBe('USDC');
  });
  it('returns null for unknown chain or contract', () => {
    expect(lookupRegistryToken('nosuchchain', MAINNET_USDC)).toBeNull();
    expect(lookupRegistryToken('mainnet', RANDOM_TOKEN)).toBeNull();
  });
});
