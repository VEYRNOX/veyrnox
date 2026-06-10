// lib/__tests__/txHistory.test.js
//
// Unit tests for the transaction-history normalizers and the fetch dispatcher.
// Pure functions only — NO network: BTC/SOL normalizers are fed fixture data
// shaped like the real Esplora / @solana/web3.js responses, and the live BTC/SOL
// fetch paths (which DO hit the network) are intentionally not exercised here.

import { describe, it, expect } from 'vitest';
import {
  normalizeBtcTx,
  normalizeSolEntry,
  demoHistoryForAsset,
  getHistorySource,
  fetchAssetHistory,
  explorerAddressUrl,
} from '../txHistory';
import { getAsset } from '@/wallet-core/assets';

const BTC = getAsset('BTC');
const SOL = getAsset('SOL');
const ETH = getAsset('ETH');
const USDC = getAsset('USDC');

const ME_BTC = 'tb1qme0000000000000000000000000000000000me';
const OTHER_BTC = 'tb1qother00000000000000000000000000000other';
const ME_SOL = 'SoLMyAddr11111111111111111111111111111111111';
const OTHER_SOL = 'OtherDest2222222222222222222222222222222222';

describe('normalizeBtcTx', () => {
  it('classifies a send (we spent more than we received) with the recipient as counterparty', () => {
    const tx = {
      txid: 'aa11',
      vin: [{ prevout: { scriptpubkey_address: ME_BTC, value: 100000 } }],
      vout: [
        { scriptpubkey_address: OTHER_BTC, value: 70000 }, // recipient
        { scriptpubkey_address: ME_BTC, value: 25000 },     // change back to us
      ],
      status: { confirmed: true, block_time: 1717000000 },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.type).toBe('send');
    // net impact = 25000 - 100000 = -75000 sats = 0.00075 BTC
    expect(n.amount).toBe('0.00075');
    expect(n.counterparty).toBe(OTHER_BTC);
    expect(n.status).toBe('confirmed');
    expect(n.timestamp).toBe(1717000000 * 1000);
    expect(n.explorerUrl).toContain('/tx/aa11');
    expect(n.assetSymbol).toBe('BTC');
  });

  it('classifies a receive with the sender as counterparty', () => {
    const tx = {
      txid: 'bb22',
      vin: [{ prevout: { scriptpubkey_address: OTHER_BTC, value: 500000 } }],
      vout: [{ scriptpubkey_address: ME_BTC, value: 120000 }],
      status: { confirmed: true, block_time: 1717100000 },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.type).toBe('receive');
    expect(n.amount).toBe('0.0012');
    expect(n.counterparty).toBe(OTHER_BTC);
  });

  it('marks an unconfirmed tx pending with a null timestamp (BTC never "fails")', () => {
    const tx = {
      txid: 'cc33',
      vin: [{ prevout: { scriptpubkey_address: OTHER_BTC, value: 10000 } }],
      vout: [{ scriptpubkey_address: ME_BTC, value: 10000 }],
      status: { confirmed: false },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.status).toBe('pending');
    expect(n.timestamp).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(normalizeBtcTx(null, ME_BTC, 'testnet')).toBeNull();
    expect(normalizeBtcTx({}, ME_BTC, 'testnet')).toBeNull();
  });
});

describe('normalizeSolEntry', () => {
  const makeEntry = ({ err = null, confirmationStatus = 'finalized', pre, post, transferInfo } = {}) => ({
    signature: { signature: 'sig123', err, confirmationStatus, blockTime: 1717200000 },
    parsed: {
      meta: { err, preBalances: pre, postBalances: post },
      transaction: {
        message: {
          accountKeys: [{ pubkey: ME_SOL }, { pubkey: OTHER_SOL }],
          instructions: transferInfo
            ? [{ program: 'system', parsed: { type: 'transfer', info: transferInfo } }]
            : [],
        },
      },
    },
  });

  it('classifies a send from the lamport delta and parses the counterparty', () => {
    const n = normalizeSolEntry(
      makeEntry({
        pre: [3_200_000_000, 0],
        post: [200_000_000, 3_000_000_000],
        transferInfo: { source: ME_SOL, destination: OTHER_SOL, lamports: 3_000_000_000 },
      }),
      ME_SOL,
      'devnet',
    );
    expect(n.type).toBe('send');
    expect(n.amount).toBe('3'); // 3,000,000,000 lamports = 3 SOL (delta magnitude)
    expect(n.counterparty).toBe(OTHER_SOL);
    expect(n.status).toBe('confirmed');
    expect(n.explorerUrl).toContain('/tx/sig123');
    expect(n.explorerUrl).toContain('cluster=devnet');
  });

  it('classifies a receive (positive delta)', () => {
    const n = normalizeSolEntry(
      makeEntry({ pre: [0, 5_000_000_000], post: [1_500_000_000, 3_500_000_000] }),
      ME_SOL,
      'devnet',
    );
    expect(n.type).toBe('receive');
    expect(n.amount).toBe('1.5');
  });

  it('marks a tx with err as failed', () => {
    const n = normalizeSolEntry(
      makeEntry({ err: { InstructionError: [0, 'Custom'] }, pre: [1_000_000_000, 0], post: [999_995_000, 0] }),
      ME_SOL,
      'devnet',
    );
    expect(n.status).toBe('failed');
  });

  it('returns null when there is no signature', () => {
    expect(normalizeSolEntry({ signature: {} }, ME_SOL, 'devnet')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FEE ENRICHMENT — the fee that the active set actually PAID, in native units.
// The fee is a fact of the raw provider response (Esplora top-level `fee` in
// sats; Solana `meta.fee` in lamports) that the normalizers previously dropped.
// `feeNative` is the tx's fee in native units (null when the indexer omits it —
// fail honest, never guess). `feePaidByUs` is whether THIS set paid it: a
// counterparty pays the fee on a tx we merely received, so it must not be
// attributed to us.
// ---------------------------------------------------------------------------

describe('normalizeBtcTx fee enrichment', () => {
  it('carries the tx fee in native units and marks it paid-by-us for a send', () => {
    const tx = {
      txid: 'fee1',
      fee: 5000, // sats — Esplora top-level field
      vin: [{ prevout: { scriptpubkey_address: ME_BTC, value: 100000 } }],
      vout: [
        { scriptpubkey_address: OTHER_BTC, value: 70000 },
        { scriptpubkey_address: ME_BTC, value: 25000 },
      ],
      status: { confirmed: true, block_time: 1717000000 },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.feeNative).toBe('0.00005'); // 5000 sats / 1e8
    expect(n.feePaidByUs).toBe(true);
  });

  it('does NOT attribute the fee to us on a pure receive (the sender paid it)', () => {
    const tx = {
      txid: 'fee2',
      fee: 5000,
      vin: [{ prevout: { scriptpubkey_address: OTHER_BTC, value: 500000 } }],
      vout: [{ scriptpubkey_address: ME_BTC, value: 120000 }],
      status: { confirmed: true, block_time: 1717100000 },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.feePaidByUs).toBe(false);
  });

  it('sets feeNative null when the indexer omits the fee (fail honest, never guess)', () => {
    const tx = {
      txid: 'fee3',
      vin: [{ prevout: { scriptpubkey_address: ME_BTC, value: 100000 } }],
      vout: [{ scriptpubkey_address: OTHER_BTC, value: 95000 }],
      status: { confirmed: true, block_time: 1717000000 },
    };
    const n = normalizeBtcTx(tx, ME_BTC, 'testnet');
    expect(n.feeNative).toBeNull();
    expect(n.feePaidByUs).toBe(true); // we funded inputs, so we paid *a* fee — amount just unreported
  });
});

describe('normalizeSolEntry fee enrichment', () => {
  const feeEntry = ({ fee, payer, other = OTHER_SOL } = {}) => ({
    signature: { signature: 'sigfee', err: null, confirmationStatus: 'finalized', blockTime: 1717200000 },
    parsed: {
      meta: { err: null, ...(fee != null ? { fee } : {}), preBalances: [3_200_000_000, 0], postBalances: [200_000_000, 3_000_000_000] },
      transaction: { message: { accountKeys: [{ pubkey: payer }, { pubkey: other }], instructions: [] } },
    },
  });

  it('carries meta.fee in native units, paid-by-us when we are the fee payer (account 0)', () => {
    const n = normalizeSolEntry(feeEntry({ fee: 5000, payer: ME_SOL }), ME_SOL, 'devnet');
    expect(n.feeNative).toBe('0.000005'); // 5000 lamports / 1e9
    expect(n.feePaidByUs).toBe(true);
  });

  it('does NOT attribute the fee to us when another account is the fee payer', () => {
    const n = normalizeSolEntry(feeEntry({ fee: 5000, payer: OTHER_SOL, other: ME_SOL }), ME_SOL, 'devnet');
    expect(n.feePaidByUs).toBe(false);
  });

  it('sets feeNative null when meta.fee is absent (fail honest)', () => {
    const n = normalizeSolEntry(feeEntry({ payer: ME_SOL }), ME_SOL, 'devnet');
    expect(n.feeNative).toBeNull();
  });
});

describe('getHistorySource', () => {
  it('reports EVM as unable to list (no JSON-RPC history method)', () => {
    const s = getHistorySource(ETH);
    expect(s.family).toBe('evm');
    expect(s.supportsList).toBe(false);
    expect(s.privacyNote).toMatch(/JSON-RPC/);
  });

  it('reports BTC and SOL as listable with an honest phone-home note', () => {
    expect(getHistorySource(BTC).supportsList).toBe(true);
    expect(getHistorySource(BTC).privacyNote).toMatch(/Esplora/);
    expect(getHistorySource(SOL).supportsList).toBe(true);
    expect(getHistorySource(SOL).privacyNote).toMatch(/RPC/);
  });
});

describe('explorerAddressUrl', () => {
  it('builds per-chain address URLs', () => {
    expect(explorerAddressUrl(ETH, '0xabc')).toContain('/address/0xabc');
    expect(explorerAddressUrl(BTC, ME_BTC)).toContain(`/address/${ME_BTC}`);
    expect(explorerAddressUrl(SOL, ME_SOL)).toContain(`/address/${ME_SOL}`);
    expect(explorerAddressUrl(SOL, ME_SOL)).toContain('cluster=devnet');
    expect(explorerAddressUrl(ETH, '')).toBe('');
  });
});

describe('demoHistoryForAsset', () => {
  it('returns clearly-labelled sample rows for every receivable asset', () => {
    for (const a of [ETH, USDC, BTC, SOL]) {
      const rows = demoHistoryForAsset(a);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.demo === true)).toBe(true);
      expect(rows.every((r) => r.assetSymbol === a.symbol)).toBe(true);
      expect(rows.every((r) => !!r.explorerUrl)).toBe(true);
    }
  });

  it('never emits a "failed" BTC row (BTC txs do not fail), but EVM/SOL do', () => {
    expect(demoHistoryForAsset(BTC).some((r) => r.status === 'failed')).toBe(false);
    expect(demoHistoryForAsset(ETH).some((r) => r.status === 'failed')).toBe(true);
    expect(demoHistoryForAsset(SOL).some((r) => r.status === 'failed')).toBe(true);
  });

  it('is deterministic (no RNG / wall-clock)', () => {
    expect(demoHistoryForAsset(ETH)).toEqual(demoHistoryForAsset(ETH));
  });

  it('attaches native-unit demo fees, attributed to us only on sends (native coins)', () => {
    for (const a of [ETH, BTC, SOL]) {
      const rows = demoHistoryForAsset(a);
      const sends = rows.filter((r) => r.type === 'send');
      const receives = rows.filter((r) => r.type === 'receive');
      expect(sends.length, a.symbol).toBeGreaterThan(0);
      expect(sends.every((r) => r.feePaidByUs === true && r.feeNative != null), `${a.symbol} sends`).toBe(true);
      expect(receives.every((r) => r.feePaidByUs === false), `${a.symbol} receives`).toBe(true);
    }
  });

  it('leaves ERC-20 demo rows fee-less (gas is paid in the native coin, not the token)', () => {
    const rows = demoHistoryForAsset(USDC);
    expect(rows.every((r) => r.feeNative === null && r.feePaidByUs === false)).toBe(true);
  });
});

describe('fetchAssetHistory (non-network paths)', () => {
  it('returns local demo data in demo mode without touching the network', async () => {
    const res = await fetchAssetHistory({ asset: BTC, address: null, demo: true });
    expect(res.demo).toBe(true);
    expect(res.supported).toBe(true);
    expect(res.transactions.length).toBeGreaterThan(0);
  });

  it('reports EVM as unsupported (explorer fallback) in live mode', async () => {
    const res = await fetchAssetHistory({ asset: ETH, address: '0xabc', demo: false });
    expect(res.supported).toBe(false);
    expect(res.reason).toBe('evm-no-indexer');
    expect(res.transactions).toEqual([]);
  });

  it('reports a locked wallet when no address is available (BTC/SOL, live)', async () => {
    const res = await fetchAssetHistory({ asset: BTC, address: null, demo: false });
    expect(res.reason).toBe('locked');
    expect(res.transactions).toEqual([]);
  });
});
