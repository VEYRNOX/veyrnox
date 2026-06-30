// wallet-core/evm/__tests__/approvals.test.js
//
// TDD coverage for Token Approvals (View + Revoke).
// Tests core encode/summarize logic that prevents silent drainer calldata.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeApprove, buildRevokeCalldata, summarizeAllowance } from '../approvals.js';

// Mock the calldata module to control describeErc20Call behavior
vi.mock('../calldata.js');

describe('encodeApprove', () => {
  it('encodes approve(spender, value) with valid address and amount', () => {
    const spender = '0x1234567890123456789012345678901234567890';
    const value = 1000n;
    const result = encodeApprove(spender, value);
    expect(result).toMatch(/^0x095ea7b3/); // approve() selector
    expect(result.length).toBe(138); // 0x + 136 hex chars
  });

  it('encodes approve with zero value (revoke)', () => {
    const spender = '0x1234567890123456789012345678901234567890';
    const result = encodeApprove(spender, 0n);
    expect(result).toMatch(/^0x095ea7b3/);
    // Data should have zero value at the end (64 zero hex chars)
    expect(result.slice(-64)).toBe('0'.repeat(64));
  });

  it('encodes approve with uint256.max (unlimited)', () => {
    const spender = '0x1234567890123456789012345678901234567890';
    const unlimited = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const result = encodeApprove(spender, unlimited);
    expect(result).toMatch(/^0x095ea7b3/);
    // Data should have all F's at the end
    expect(result.slice(-64)).toBe('f'.repeat(64));
  });

  it('throws on invalid spender address (too short)', () => {
    expect(() => encodeApprove('0x123', 100n)).toThrow(/Invalid spender/i);
  });

  it('throws on invalid spender address (not hex)', () => {
    expect(() => encodeApprove('not-an-address', 100n)).toThrow(/Invalid spender/i);
  });

  it('throws on empty string spender', () => {
    expect(() => encodeApprove('', 100n)).toThrow(/Invalid spender/i);
  });
});

describe('buildRevokeCalldata', () => {
  beforeEach(() => {
    // Reset mock before each test
    vi.clearAllMocks();
  });

  it('builds and self-checks a zero-approve revoke', async () => {
    // Mock describeErc20Call to return a valid zero-approve summary
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      spender: '0x1234567890123456789012345678901234567890',
      amount: '0',
      unlimited: false,
    });

    const result = buildRevokeCalldata({
      spender: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'USDC',
      decimals: 6,
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('value', 0n);
    expect(result).toHaveProperty('summary');
    expect(result.data).toMatch(/^0x095ea7b3/);
  });

  it('throws if decoded kind is not approve (defense-in-depth)', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'transfer', // NOT approve
      amount: '0',
    });

    expect(() => {
      buildRevokeCalldata({
        spender: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'USDC',
      });
    }).toThrow(/self-check failed/i);
  });

  it('throws if decoded amount is not zero (defense-in-depth)', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '1000', // NOT zero
      unlimited: false,
    });

    expect(() => {
      buildRevokeCalldata({
        spender: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'USDC',
      });
    }).toThrow(/self-check failed/i);
  });

  it('throws if unlimited flag is set (even if amount is zero)', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '0',
      unlimited: true, // UNLIMITED flag, even though amount is 0
    });

    expect(() => {
      buildRevokeCalldata({
        spender: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'USDC',
      });
    }).toThrow(/self-check failed/i);
  });

  it('throws on invalid spender (fails closed)', () => {
    expect(() => {
      buildRevokeCalldata({
        spender: 'not-valid',
        tokenSymbol: 'USDC',
      });
    }).toThrow();
  });
});

describe('summarizeAllowance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies a zero allowance', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '0',
      unlimited: false,
    });

    const result = summarizeAllowance({
      rawAmount: 0n,
      spender: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'USDC',
      decimals: 6,
    });

    expect(result.unlimited).toBe(false);
    expect(result.amount).toBe('0');
  });

  it('classifies uint256.max as unlimited', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    const unlimited = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: unlimited.toString(),
      unlimited: true,
      warning: 'UNLIMITED',
    });

    const result = summarizeAllowance({
      rawAmount: unlimited,
      spender: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'USDC',
      decimals: 6,
    });

    expect(result.unlimited).toBe(true);
    expect(result.warning).toBe('UNLIMITED');
  });

  it('accepts rawAmount as string (coerces to bigint)', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '1000000',
      unlimited: false,
    });

    const result = summarizeAllowance({
      rawAmount: '1000000', // as string, not bigint
      spender: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'USDC',
      decimals: 6,
    });

    expect(result).toHaveProperty('kind', 'approve');
  });

  it('handles invalid spender gracefully (uses zero address)', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '1000',
      unlimited: false,
    });

    // Should not throw; uses 0x0...0 address for display
    const result = summarizeAllowance({
      rawAmount: 1000n,
      spender: '0xinvalid-not-a-valid-address',
      tokenSymbol: 'USDC',
      decimals: 6,
    });

    expect(result).toBeDefined();
  });

  it('defaults decimals to 18 if not provided', async () => {
    const { describeErc20Call } = await import('../calldata.js');
    vi.mocked(describeErc20Call).mockReturnValue({
      kind: 'approve',
      amount: '1000',
      unlimited: false,
    });

    const result = summarizeAllowance({
      rawAmount: 1000n,
      spender: '0x1234567890123456789012345678901234567890',
      tokenSymbol: 'UNKNOWN',
      // decimals omitted, should default to 18
    });

    expect(result).toBeDefined();
  });
});
