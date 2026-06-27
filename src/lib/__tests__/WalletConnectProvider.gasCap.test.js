// M9 — 1M gas cap must apply even when the dApp omits the `gas` field.
// A malicious dApp can omit `gas` so ethers auto-estimates with no cap; a tx
// crafted to consume the full block gas limit would then drain funds. The cap
// must be enforced against the estimated gas too, not only the dApp-supplied
// value. Pure helper resolveGasLimit(txGas, estimatedGas) is the contract.

import { describe, it, expect } from 'vitest';
import { resolveGasLimit } from '@/lib/WalletConnectProvider.jsx';

const CAP = 1_000_000n;

describe('resolveGasLimit (M9 — unconditional 1M cap)', () => {
  it('caps the ESTIMATED gas when the dApp omits `gas`', () => {
    // dApp sent no gas; provider.estimateGas returned a large value.
    const limit = resolveGasLimit(undefined, 5_000_000n);
    expect(limit).toBe(CAP);
    expect(limit <= CAP).toBe(true);
  });

  it('caps a large dApp-supplied `gas` value', () => {
    const limit = resolveGasLimit('0x4C4B40', 21_000n); // 5,000,000 hex
    expect(limit).toBe(CAP);
  });

  it('passes through a small dApp-supplied `gas` value unchanged', () => {
    const limit = resolveGasLimit(21_000n, 5_000_000n);
    expect(limit).toBe(21_000n);
  });

  it('passes through a small estimate unchanged when `gas` omitted', () => {
    const limit = resolveGasLimit(undefined, 50_000n);
    expect(limit).toBe(50_000n);
  });
});
