// analytics/__tests__/feeAnalytics.test.js
//
// Unit tests for the STATELESS fee-analytics computation (Slice 1). Pure
// functions over an active-set history result (as returned by fetchAssetHistory)
// — NO network, NO persistence, NO fiat. Fees are in native units only.
//
// The honesty properties under test (these are the point of the slice):
//   - EVM history is unavailable in-app → analytics reports "unavailable",
//     never a guessed or zero figure (I4 fail-honest; mirrors the I4 commit
//     that distinguishes an indeterminate read from $0).
//   - A locked wallet is indeterminate, not zero fees.
//   - Only fees the active set actually PAID are counted (a counterparty pays
//     the fee on a tx we merely received).
//   - A paid tx whose fee the indexer did not report is surfaced as "unknown",
//     never folded into the total as a guess.
//   - Summation is exact (integer base units), not float.

import { describe, it, expect } from 'vitest';
import { computeFeeAnalytics } from '../feeAnalytics';
import { demoHistoryForAsset } from '@/lib/txHistory';
import { getAsset } from '@/wallet-core/assets';

const BTC = getAsset('BTC');
const SOL = getAsset('SOL');
const ETH = getAsset('ETH');
const USDC = getAsset('USDC');

// Minimal normalized rows carrying only the fields the analytics reads.
const row = (over) => ({
  id: 'x', hash: 'x', type: 'send', status: 'confirmed', timestamp: 1717000000000,
  feeNative: '0.00005', feePaidByUs: true, explorerUrl: '', ...over,
});

describe('computeFeeAnalytics — availability (fail honest)', () => {
  it('reports unavailable for EVM history (no in-app indexer), not zero', () => {
    const r = computeFeeAnalytics({ supported: false, reason: 'evm-no-indexer', transactions: [] }, ETH);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('evm-no-indexer');
    expect(r.totalFeeNative).toBeUndefined(); // no number is offered, honest blank
  });

  it('treats a locked wallet as indeterminate, not as zero fees', () => {
    const r = computeFeeAnalytics({ supported: true, reason: 'locked', transactions: [] }, BTC);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('locked');
  });

  it('reports an honest zero when unlocked with genuinely no history', () => {
    const r = computeFeeAnalytics({ supported: true, transactions: [] }, BTC);
    expect(r.available).toBe(true);
    expect(r.paidTxCount).toBe(0);
    expect(r.totalFeeNative).toBe('0');
  });
});

describe('computeFeeAnalytics — attribution + aggregation', () => {
  const history = {
    supported: true,
    transactions: [
      row({ id: 'a', feeNative: '0.00005', feePaidByUs: true }),  // ours
      row({ id: 'b', feeNative: '0.0001', feePaidByUs: true }),   // ours
      row({ id: 'c', type: 'receive', feeNative: '0.00009', feePaidByUs: false }), // not ours
    ],
  };

  it('sums only the fees the set actually paid, in native units', () => {
    const r = computeFeeAnalytics(history, BTC);
    expect(r.assetSymbol).toBe('BTC');
    expect(r.paidTxCount).toBe(2);          // the receive is excluded
    expect(r.totalFeeNative).toBe('0.00015'); // 0.00005 + 0.0001, exact
    expect(r.avgFeeNative).toBe('0.000075');
    expect(r.maxFeeNative).toBe('0.0001');
    expect(r.minFeeNative).toBe('0.00005');
  });

  it('lists per-tx fee entries for paid txs only, preserving input order', () => {
    const r = computeFeeAnalytics(history, BTC);
    expect(r.perTx.map((t) => t.id)).toEqual(['a', 'b']);
    expect(r.perTx[0].feeNative).toBe('0.00005');
  });

  it('sums exactly (no float drift) over many small fees', () => {
    const txs = Array.from({ length: 10 }, (_, i) => row({ id: `f${i}`, feeNative: '0.00000001', feePaidByUs: true }));
    const r = computeFeeAnalytics({ supported: true, transactions: txs }, BTC);
    expect(r.totalFeeNative).toBe('0.0000001'); // 10 * 1 sat = 10 sats, exact
  });
});

describe('computeFeeAnalytics — unknown-fee honesty', () => {
  it('surfaces paid txs with an unreported fee as unknown, never guessed into the total', () => {
    const r = computeFeeAnalytics({
      supported: true,
      transactions: [
        row({ id: 'a', feeNative: '0.00005', feePaidByUs: true }),
        row({ id: 'b', feeNative: null, feePaidByUs: true }), // we paid, amount unreported
      ],
    }, BTC);
    expect(r.paidTxCount).toBe(1);          // only the known-fee paid tx
    expect(r.unknownFeeCount).toBe(1);      // surfaced, not silently dropped
    expect(r.totalFeeNative).toBe('0.00005'); // unknown fee NOT added
    expect(r.perTx.map((t) => t.id)).toEqual(['a']);
  });
});

describe('computeFeeAnalytics — demo mode is populated (native units)', () => {
  it('produces a non-zero native-unit total over demo SOL history', () => {
    const r = computeFeeAnalytics({ supported: true, demo: true, transactions: demoHistoryForAsset(SOL) }, SOL);
    expect(r.available).toBe(true);
    expect(r.paidTxCount).toBeGreaterThan(0);
    expect(parseFloat(r.totalFeeNative)).toBeGreaterThan(0);
  });

  it('reports zero paid fees for an ERC-20 demo asset (fee is in the native coin, not the token)', () => {
    const r = computeFeeAnalytics({ supported: true, demo: true, transactions: demoHistoryForAsset(USDC) }, USDC);
    expect(r.paidTxCount).toBe(0);
    expect(r.unknownFeeCount).toBe(0);
  });
});

describe('computeFeeAnalytics — Solana decimals', () => {
  it('aggregates SOL fees at 9 decimals', () => {
    const r = computeFeeAnalytics({
      supported: true,
      transactions: [
        row({ id: 'a', feeNative: '0.000005', feePaidByUs: true }),
        row({ id: 'b', feeNative: '0.000005', feePaidByUs: true }),
      ],
    }, SOL);
    expect(r.assetSymbol).toBe('SOL');
    expect(r.totalFeeNative).toBe('0.00001'); // 5000 + 5000 lamports = 10000
  });
});
