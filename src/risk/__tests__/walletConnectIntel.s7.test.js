// Pen test 2026-09-22 (#2741) — S7 (calldata/contract-code mismatch) was fetched
// but never scored on the WalletConnect signing path. walletConnectIntel.js built
// a hand array [S2,S3,S4,S9], omitting S7, while fromWalletConnect.js and
// RequestApprovalModal.jsx both documented S7 as live here. Result: a value send
// straight into a contract (or calldata to a non-contract) reached the WC approval
// modal with NO caution — same fail-silent shape as #2740.
//
// The simulate mock returns recipientCode '0x6080' (a contract) for every call, so
// a value-only send (data '0x') is exactly S7's "value to contract -> CAUTION".
//
// EXPECTED: RED until S7 is wired into WC_TX_RISK_SIGNAL_IMPORTS + the score array.

import { describe, it, expect, vi } from 'vitest';
import { LEVEL } from '@/risk/levels';

vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x6080' })), // recipient IS a contract
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', name: 'Sepolia Testnet', symbol: 'ETH', isTestnet: true })),
}));
vi.mock('@/api/tipScreen.js', () => ({
  screenTransaction: vi.fn(async () => null), // S9 contributes nothing -> isolate S7
}));

import { buildWcTransactionIntelligence } from '@/risk/walletConnectIntel.js';

const WALLET_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CONTRACT = '0x3333444455556666777788889999000011112222';

describe('WC S7 — calldata/contract-code mismatch is scored on the dApp path', () => {
  it('flags a bare value send into a contract as CAUTION (not OK)', async () => {
    const intel = await buildWcTransactionIntelligence({
      txParams: { from: WALLET_ADDR, to: CONTRACT, value: '0x1', data: '0x' },
      caip2ChainId: 'eip155:11155111',
      evmAddress: WALLET_ADDR,
      remoteScreenEnabled: true,
    });
    expect(intel.localVerdict.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'S7', level: LEVEL.CAUTION })]),
    );
    expect(intel.txLevel).toBe(LEVEL.CAUTION);
  });
});
