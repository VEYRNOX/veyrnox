// src/lib/__tests__/WalletConnectProvider.txRiskGate.test.js
//
// TDD pin for issue #1093: WC eth_sendTransaction pre-sign gate must compose a
// REAL tx-risk txLevel (not the placeholder LEVEL.OK) so unlimited approvals
// and known-poison recipients drive presignGate → CONFIRM/BLOCK and reject the
// request before the key is touched. Fail closed (I4): the WC surface has no
// "sign anyway" affordance, so any non-ALLOW composed decision must reject.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spyable presignGate — we assert the ARGS it receives so the composition of
// txLevel is directly pinned (not just the terminal reject outcome).
vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(() => ({ proceedAllowed: true, signerReachable: true, decision: 'allow', owner: null })),
}));

vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn', BLOCK: 'block' },
  detect: vi.fn(() => ({ condition: 'CLEAN' })),
  degrade: vi.fn((r) => ({ tier: 'allow', sentence: null, ...(r ?? {}) })),
  browserProbeSource: {},
  nativeProbeSource: vi.fn(),
  selectPresignProbeSource: vi.fn(() => ({})),
  attestationProbeSource: vi.fn(),
  detectAttestation: vi.fn(() => ({})),
  composeConditions: vi.fn((a) => a),
  ATTESTATION_ENABLED: false,
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));

vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(async () => {}),
  onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => false),
  approveSession: vi.fn(async () => {}),
  rejectSession: vi.fn(async () => {}),
  respondToRequest: vi.fn(async () => {}),
  rejectRequest: vi.fn(async () => {}),
  disconnectSession: vi.fn(async () => {}),
  pairWithDapp: vi.fn(async () => {}),
}));

vi.mock('@/wallet-core/evm/walletconnect/router.js', () => ({
  classifyRequest: vi.fn(() => 'SEND_TRANSACTION'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { PERSONAL_SIGN: 'PERSONAL_SIGN', SIGN_TYPED_DATA: 'SIGN_TYPED_DATA', SEND_TRANSACTION: 'SEND_TRANSACTION' },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(async () => '0xaa36a7'),
    estimateGas: vi.fn(async () => 21_000n),
    getCode: vi.fn(async () => '0x'),
  })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111, symbol: 'ETH' })),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({ useWallet: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Keep the REAL ethers Interface + MaxUint256 so classifyApprove in @/risk/calldata
// actually decodes the calldata under test. Only override Wallet so we don't
// broadcast anything real.
const fakeWalletInstance = {
  signMessage: vi.fn(async () => '0xsig'),
  signTypedData: vi.fn(async () => '0xsig'),
  sendTransaction: vi.fn(async () => ({ hash: '0xtxhash' })),
};
function FakeWallet() { return fakeWalletInstance; }
FakeWallet.prototype = fakeWalletInstance;

vi.mock('ethers', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Wallet: FakeWallet,
    },
  };
});

import { presignGate } from '@/sign-gate/presign';
import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';
import { LEVEL } from '@/risk/levels';

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
const RECIPIENT   = '0x1111222233334444555566667777888899990000';
const SPENDER     = '0x2222333344445555666677778888999900001111';
const TOKEN       = '0x3333444455556666777788889999000011112222';

// approve(spender, MAX_UINT256) — the classic unlimited-approval calldata that
// S2 (unlimited-approval) must catch and score RISK.
const APPROVE_UNLIMITED =
  '0x095ea7b3'
  + '000000000000000000000000' + SPENDER.slice(2).toLowerCase()
  + 'f'.repeat(64);

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

describe('#1093 — WC eth_sendTransaction composes real tx-risk into presignGate', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset presignGate to the permissive default; individual tests may re-stub.
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true, decision: 'allow', owner: null });
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  const deps = () => ({
    withPrivateKey,
    evmAddress: WALLET_ADDR,
    actionPasswordConfigured: false,
    txLimits: [],
    history: [],
    usdRates: {},
  });

  it('plain native send: presignGate is called with LEVEL.OK (no risk fires)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 1, [{ from: WALLET_ADDR, to: RECIPIENT, value: '0x1', data: '0x' }], 'eip155:11155111',
    );
    expect(presignGate).toHaveBeenCalled();
    // Second arg is the composed txLevel.
    const call = presignGate.mock.calls[0];
    expect(call[1]).toBe(LEVEL.OK);
  });

  it('unlimited approve calldata: presignGate is called with LEVEL.RISK (S2 fires)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 2, [{ from: WALLET_ADDR, to: TOKEN, value: '0x0', data: APPROVE_UNLIMITED }], 'eip155:11155111',
    ).catch(() => {});
    expect(presignGate).toHaveBeenCalled();
    const call = presignGate.mock.calls[0];
    expect(call[1]).toBe(LEVEL.RISK);
  });

  it('tx-owned CONFIRM decision rejects with TX_RISK_REJECTED (fail closed, I4)', async () => {
    presignGate.mockReturnValue({
      proceedAllowed: false, signerReachable: true, decision: 'confirm', owner: 'tx',
    });
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 3, [{ from: WALLET_ADDR, to: TOKEN, value: '0x0', data: APPROVE_UNLIMITED }], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 3, 'TX_RISK_REJECTED');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
  });
});
