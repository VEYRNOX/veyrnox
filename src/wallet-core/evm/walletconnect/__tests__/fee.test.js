// src/wallet-core/evm/walletconnect/__tests__/fee.test.js
//
// Audit 2026-08-03 H-7 — the WalletConnect approval modal rendered Network, To,
// Value and a calldata prefix, and NO fee row. The M9 / F-02-GASCAP caps bound
// the worst case (1,000,000 gas × the per-chain MAX_BASE_FEE_GWEI ceiling) but
// that bound was never disclosed, so a dApp could request `value: 0x0` with
// maxFeePerGas and maxPriorityFeePerGas at the ceiling and a callee that burns
// its gas limit. The modal showed "0 ETH" and the user approved a fee bill of up
// to ~1 native token on mainnet.
//
// resolveWcWorstCaseFeeWei is the pure contract behind the new fee row. It must
// derive from the SAME cap helpers that ENFORCE the ceiling, so the number shown
// and the number enforced cannot drift — the discipline the send flow already
// applies ("the verdict the user sees and the verdict the gate enforces can
// never diverge").
//
// I4: when the fee cannot be determined honestly it returns null so the caller
// renders NOTHING, rather than a fabricated or misleading figure.

import { describe, it, expect } from 'vitest';
import {
  resolveWcWorstCaseFeeWei,
  WC_GAS_CAP,
} from '@/wallet-core/evm/walletconnect/fee.js';
import { MAX_BASE_FEE_GWEI } from '@/wallet-core/evm/fees.js';

const GWEI = 1_000_000_000n;

describe('resolveWcWorstCaseFeeWei (H-7 — disclose the bound the caps already enforce)', () => {
  it('multiplies the capped fee by the requested gas limit', () => {
    const fee = resolveWcWorstCaseFeeWei(
      { maxFeePerGas: 10n * GWEI, gas: 21_000n },
      'sepolia',
    );
    expect(fee).toBe(10n * GWEI * 21_000n);
  });

  it('uses the per-chain ceiling when the dApp asks for more than the cap', () => {
    // The attack shape: fee pinned at/above the ceiling.
    const fee = resolveWcWorstCaseFeeWei(
      { maxFeePerGas: '0xffffffffffffffffff', gas: 21_000n },
      'mainnet',
    );
    expect(fee).toBe(MAX_BASE_FEE_GWEI.mainnet * GWEI * 21_000n);
  });

  it('clamps a gas limit above WC_GAS_CAP to the cap', () => {
    const fee = resolveWcWorstCaseFeeWei(
      { maxFeePerGas: 1n * GWEI, gas: 50_000_000n },
      'sepolia',
    );
    expect(fee).toBe(1n * GWEI * WC_GAS_CAP);
  });

  it('assumes the full gas cap when the dApp omits `gas` (the provider estimates, then clamps)', () => {
    const fee = resolveWcWorstCaseFeeWei({ maxFeePerGas: 2n * GWEI }, 'sepolia');
    expect(fee).toBe(2n * GWEI * WC_GAS_CAP);
  });

  it('reflects the full worst case of the documented attack: 0-value, capped fee, capped gas', () => {
    const fee = resolveWcWorstCaseFeeWei(
      { value: '0x0', maxFeePerGas: '0xffffffffffffffffff', maxPriorityFeePerGas: '0xffffffffffffffffff' },
      'mainnet',
    );
    // ~1 native token on mainnet — the number the user was never shown.
    expect(fee).toBe(MAX_BASE_FEE_GWEI.mainnet * GWEI * WC_GAS_CAP);
    expect(fee).toBeGreaterThan(0n);
  });

  it('honours a legacy gasPrice when maxFeePerGas is absent', () => {
    const fee = resolveWcWorstCaseFeeWei({ gasPrice: 5n * GWEI, gas: 21_000n }, 'sepolia');
    expect(fee).toBe(5n * GWEI * 21_000n);
  });

  it('prefers maxFeePerGas over gasPrice when both are present', () => {
    const fee = resolveWcWorstCaseFeeWei(
      { maxFeePerGas: 7n * GWEI, gasPrice: 5n * GWEI, gas: 21_000n },
      'sepolia',
    );
    expect(fee).toBe(7n * GWEI * 21_000n);
  });

  // ---- I4: render nothing rather than something wrong ----

  it('returns null when the dApp supplies no fee field at all', () => {
    // The provider fills fees from live network feeData in this case; the modal
    // cannot know that value synchronously. Showing the ceiling here would be
    // alarmist and wrong — render no figure instead.
    expect(resolveWcWorstCaseFeeWei({ to: '0xabc', gas: 21_000n }, 'sepolia')).toBeNull();
  });

  it('returns null on an unparseable fee', () => {
    expect(resolveWcWorstCaseFeeWei({ maxFeePerGas: 'not-a-number' }, 'sepolia')).toBeNull();
  });

  it('returns null on an unparseable gas limit', () => {
    expect(resolveWcWorstCaseFeeWei({ maxFeePerGas: 1n * GWEI, gas: 'oops' }, 'sepolia')).toBeNull();
  });

  it('returns null for a missing or non-object tx', () => {
    expect(resolveWcWorstCaseFeeWei(null, 'sepolia')).toBeNull();
    expect(resolveWcWorstCaseFeeWei(undefined, 'sepolia')).toBeNull();
    expect(resolveWcWorstCaseFeeWei('0x', 'sepolia')).toBeNull();
  });

  it('falls back to the mainnet (lowest, safest) ceiling for an unknown network', () => {
    const fee = resolveWcWorstCaseFeeWei(
      { maxFeePerGas: '0xffffffffffffffffff', gas: 21_000n },
      'not-a-real-network',
    );
    expect(fee).toBe(MAX_BASE_FEE_GWEI.mainnet * GWEI * 21_000n);
  });

  it('treats a negative gas limit as undeterminable rather than coercing it', () => {
    expect(resolveWcWorstCaseFeeWei({ maxFeePerGas: 1n * GWEI, gas: -1n }, 'sepolia')).toBeNull();
  });
});
