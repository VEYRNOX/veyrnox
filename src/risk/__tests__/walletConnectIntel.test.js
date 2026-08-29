import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LEVEL } from '@/risk/levels';

vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x6080' })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({
    key: 'sepolia',
    name: 'Sepolia Testnet',
    symbol: 'ETH',
    isTestnet: true,
  })),
}));

vi.mock('@/api/tipScreen.js', () => ({
  screenTransaction: vi.fn(async () => null),
}));

import { buildWcTransactionIntelligence } from '@/risk/walletConnectIntel.js';
import { screenTransaction } from '@/api/tipScreen.js';

const WALLET_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TOKEN = '0x3333444455556666777788889999000011112222';
const SPENDER = '0x2222333344445555666677778888999900001111';
// Tornado Cash 0.1 ETH router — the issue #1664 repro address, on the static list.
const STATIC_OFAC_ADDR = '0x8589427373d6d84e98730d7795d8f6f8731fda16';

const APPROVE_UNLIMITED =
  '0x095ea7b3'
  + '000000000000000000000000' + SPENDER.slice(2).toLowerCase()
  + 'f'.repeat(64);

describe('buildWcTransactionIntelligence', () => {
  beforeEach(() => {
    screenTransaction.mockClear();
  });

  it('returns one shared risky verdict for an unlimited approval request', async () => {
    const intel = await buildWcTransactionIntelligence({
      txParams: {
        from: WALLET_ADDR,
        to: TOKEN,
        value: '0x0',
        data: APPROVE_UNLIMITED,
      },
      caip2ChainId: 'eip155:11155111',
      evmAddress: WALLET_ADDR,
    });

    expect(intel.txLevel).toBe(LEVEL.RISK);
    expect(intel.localVerdict.level).toBe(LEVEL.RISK);
    expect(intel.verdict.level).toBe(LEVEL.RISK);
    expect(intel.verdict.primaryReason).toMatch(/unlimited spending/i);
    expect(intel.verdict.localSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'S2', level: LEVEL.RISK }),
      ]),
    );
    expect(intel.verdict.contributors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'local', applicable: true, settled: true, level: LEVEL.RISK }),
        expect.objectContaining({ id: 'runtime', applicable: true, settled: true, level: 'OK' }),
      ]),
    );
  });

  it('elevates the WalletConnect tx level when remote TIP returns a hit', async () => {
    screenTransaction.mockResolvedValueOnce({
      verdict: 'block',
      level: 'high',
      risks: [{ level: 'high', title: 'known drainer', detail: 'Known threat detected by threat intelligence screening.' }],
      signals: [{ signal_type: 'known_drainer', source: 'TIP', confidence: 0.99 }],
      sanctions: false,
      sourcesConsulted: [{ source: 'tip', status: 'hit', latency_ms: 10 }],
      verdictReason: 'Known threat detected by threat intelligence screening.',
      raw: null,
    });

    const intel = await buildWcTransactionIntelligence({
      txParams: {
        from: WALLET_ADDR,
        to: TOKEN,
        value: '0x1',
        data: '0x',
      },
      caip2ChainId: 'eip155:11155111',
      evmAddress: WALLET_ADDR,
      remoteScreenEnabled: true,
    });

    expect(intel.tipResult?.verdict).toBe('block');
    expect(intel.txLevel).toBe('RISK');
    expect(intel.verdict.level).toBe('RISK');
    expect(intel.verdict.contributors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tip', applicable: true, settled: true, level: 'RISK' }),
      ]),
    );
    expect(screenTransaction).toHaveBeenCalled();
  });

  // H-3 (2026-08-25 weekly audit). The WC builder used to score with a hard-coded
  // two-signal registry (S2 + S4) and never injected the TIP result into
  // chainData, so S9 never ran on this path. Three verdict shapes reached the
  // pre-sign gate as LEVEL.OK while the modal told the user remote screening had
  // run (I4/I5). Each case below is that bypass, pinned to the machine level.
  describe('H-3 — the TIP verdict is enforced, not merely fetched', () => {
    it('scores a sanctions hit as RISK even when the verdict field says allow', async () => {
      screenTransaction.mockResolvedValueOnce({
        verdict: 'allow',
        level: 'info',
        risks: [],
        signals: [],
        sourcesConsulted: [],
        verdictReason: null,
        sanctions: true,
        raw: null,
      });

      const intel = await buildWcTransactionIntelligence({
        txParams: { from: WALLET_ADDR, to: TOKEN, value: '0x1', data: '0x' },
        caip2ChainId: 'eip155:11155111',
        evmAddress: WALLET_ADDR,
        remoteScreenEnabled: true,
      });

      expect(intel.localVerdict.signals).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'S9', level: LEVEL.RISK })]),
      );
      expect(intel.txLevel).toBe(LEVEL.RISK);
      expect(intel.verdict.level).toBe(LEVEL.RISK);
    });

    it('scores a block verdict that carries no threat_signals rows as RISK', async () => {
      screenTransaction.mockResolvedValueOnce({
        verdict: 'block',
        level: 'high',
        risks: [],
        signals: [],
        sourcesConsulted: [],
        verdictReason: null,
        sanctions: false,
        raw: null,
      });

      const intel = await buildWcTransactionIntelligence({
        txParams: { from: WALLET_ADDR, to: TOKEN, value: '0x1', data: '0x' },
        caip2ChainId: 'eip155:11155111',
        evmAddress: WALLET_ADDR,
        remoteScreenEnabled: true,
      });

      expect(intel.txLevel).toBe(LEVEL.RISK);
      expect(intel.verdict.level).toBe(LEVEL.RISK);
    });

    it('applies the static OFAC fallback even when remote screening is off', async () => {
      const intel = await buildWcTransactionIntelligence({
        txParams: { from: WALLET_ADDR, to: STATIC_OFAC_ADDR, value: '0x1', data: '0x' },
        caip2ChainId: 'eip155:11155111',
        evmAddress: WALLET_ADDR,
        remoteScreenEnabled: false,
      });

      expect(screenTransaction).not.toHaveBeenCalled();
      expect(intel.txLevel).toBe(LEVEL.RISK);
      expect(intel.verdict.level).toBe(LEVEL.RISK);
    });

    it('leaves a clean allow verdict at OK — S9 does not invent friction', async () => {
      screenTransaction.mockResolvedValueOnce({
        verdict: 'allow',
        level: 'info',
        risks: [],
        signals: [],
        sourcesConsulted: [],
        verdictReason: null,
        sanctions: false,
        raw: null,
      });

      const intel = await buildWcTransactionIntelligence({
        txParams: { from: WALLET_ADDR, to: TOKEN, value: '0x1', data: '0x' },
        caip2ChainId: 'eip155:11155111',
        evmAddress: WALLET_ADDR,
        remoteScreenEnabled: true,
      });

      expect(intel.localVerdict.signals).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'S9', level: LEVEL.OK })]),
      );
      expect(intel.txLevel).toBe(LEVEL.OK);
    });
  });
});
