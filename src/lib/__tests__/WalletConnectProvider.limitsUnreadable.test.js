// src/lib/__tests__/WalletConnectProvider.limitsUnreadable.test.js
//
// Audit 2026-09-07 L-6 — an unreadable spend-cap store must not silently disable
// the cap gate.
//
// The read used to collapse a FAILURE into the same value as a genuine empty
// result (`txLimits = []`, with the code's own comment saying "fail open on
// limit axis"). Every fail-closed branch in the handler is guarded by
// `hasEnabledSpendLimit(txLimits)`, which is false for an empty list — so a
// storage failure turned the entire limit axis off, with no signal.
//
// That was the wrong way round against this handler's own posture: it already
// refuses the strictly LESS severe case, a transfer it cannot VALUE, while any
// cap is configured (WC_SEND_UNVALUED_TOKEN). Not knowing whether a cap exists
// is at least as bad as not knowing an amount.
//
// Mutation-checked: dropping `limitsUnavailable` from the handler's opts (so it
// defaults false) reds the first two cases and leaves the empty-list case green.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rejectRequest = vi.fn(() => Promise.resolve());
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(), onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => []), destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true), approveSession: vi.fn(), rejectSession: vi.fn(),
  respondToRequest: vi.fn(() => Promise.resolve()),
  rejectRequest: (...a) => rejectRequest(...a),
  disconnectSession: vi.fn(), pairWithDapp: vi.fn(),
}));
vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(() => ({ proceedAllowed: true, signerReachable: true, decision: 'allow' })),
}));
vi.mock('@/rasp', () => ({
  detect: vi.fn(() => ({})), degrade: vi.fn(() => ({ tier: 'allow' })),
  TIER: { ALLOW: 'allow', BLOCK: 'block' }, browserProbeSource: {},
  selectPresignProbeSource: vi.fn(() => ({})), nativeProbeSource: vi.fn(),
  attestationProbeSource: vi.fn(), detectAttestation: vi.fn(), composeConditions: vi.fn(),
  ATTESTATION_ENABLED: false, FRESH_PROBE_TIMEOUT_MS: 1500,
}));
vi.mock('@/risk/levels', () => ({ LEVEL: { OK: 'ok', CAUTION: 'caution' } }));
vi.mock('@/risk/walletConnectIntel.js', () => ({
  buildWcTransactionIntelligence: vi.fn(() => Promise.resolve({ txLevel: 'ok' })),
  WC_TX_RISK_SIGNALS: [],
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', symbol: 'ETH' })),
}));
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve('0xaa36a7')),
    estimateGas: vi.fn(() => Promise.resolve(21_000n)),
    getFeeData: vi.fn(() => Promise.resolve({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n })),
  })),
}));
const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor() { this.address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; }
      sendTransaction() { return Promise.resolve({ hash: '0xhash' }); }
    },
    getBytes: (x) => x,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v),
  },
}));

import { _handleSendTransaction } from '@/lib/WalletConnectProvider.jsx';

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TX = [{ from: ADDR, to: '0xdef', value: '0x0' }];

const send = (opts) => _handleSendTransaction(
  { withPrivateKey, evmAddress: ADDR, ...opts },
  'topic', 1, TX, 'eip155:11155111',
);

beforeEach(() => { rejectRequest.mockClear(); withPrivateKey.mockClear(); });

describe('WC send — unreadable spend caps fail CLOSED (audit L-6)', () => {
  it('refuses with WC_SEND_LIMITS_UNAVAILABLE when the caps could not be read', async () => {
    await expect(send({ limitsUnavailable: true })).rejects.toThrow('WC_SEND_LIMITS_UNAVAILABLE');
    expect(rejectRequest).toHaveBeenCalledWith('topic', 1, 'WC_SEND_LIMITS_UNAVAILABLE');
  });

  it('never reaches the signer when the caps could not be read', async () => {
    await expect(send({ limitsUnavailable: true })).rejects.toThrow();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('still allows a send when the caps are genuinely EMPTY (not unreadable)', async () => {
    // The distinction this finding is about. "No caps configured" is a real,
    // common state and must keep working — otherwise the fix would block every
    // send for every user who never set a limit.
    await send({ limitsUnavailable: false, txLimits: [] });
    expect(rejectRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).toHaveBeenCalled();
  });
});
