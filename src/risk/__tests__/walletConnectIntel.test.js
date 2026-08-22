import { describe, it, expect, vi } from 'vitest';
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

const APPROVE_UNLIMITED =
  '0x095ea7b3'
  + '000000000000000000000000' + SPENDER.slice(2).toLowerCase()
  + 'f'.repeat(64);

describe('buildWcTransactionIntelligence', () => {
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
});
