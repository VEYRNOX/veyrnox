// src/lib/__tests__/WalletConnectProvider.twoFactorAndLimit.test.js
//
// TDD pin for issue #1090: the WalletConnect send handler must NOT bypass the
// Action Password 2FA gate or the per-tx / daily spend-limit gate that the in-app
// Send flow enforces. Because the WC surface has no UI to prompt for the Action
// Password mid-flow, and no in-band affordance to acknowledge a limit breach, the
// honest fail-closed path (I4) is to REJECT the request with a dedicated code so
// the user can complete the send via the in-app Send screen instead.
//
// Codes contracted:
//   WC_TWO_FACTOR_REQUIRED   — Action Password configured, cannot be satisfied here
//   WC_SEND_LIMIT_EXCEEDED   — would exceed a configured per-tx / daily cap

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const fakeWalletInstance = {
  signMessage: vi.fn(async () => '0xsig'),
  signTypedData: vi.fn(async () => '0xsig'),
  sendTransaction: vi.fn(async () => ({ hash: '0xtxhash' })),
};
function FakeWallet() { return fakeWalletInstance; }
FakeWallet.prototype = fakeWalletInstance;

vi.mock('ethers', () => ({
  ethers: {
    Wallet: FakeWallet,
    getBytes: (v) => v,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
    getAddress: (v) => v,
  },
}));

import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
const RECIPIENT   = '0x1111222233334444555566667777888899990000';

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

describe('#1090 — WC eth_sendTransaction enforces 2FA + spend-limit gates', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  const baseTx = { from: WALLET_ADDR, to: RECIPIENT, value: '0x0', data: '0x' };

  it('rejects WC_TWO_FACTOR_REQUIRED when actionPasswordConfigured=true (fail closed, I4)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      {
        withPrivateKey,
        evmAddress: WALLET_ADDR,
        actionPasswordConfigured: true,
        txLimits: [],
        history: [],
        usdRates: {},
      },
      'topic', 90, [baseTx], 'eip155:11155111',
    ).catch(() => {}); // handler throws on reject
    expect(rejectRequest).toHaveBeenCalledWith('topic', 90, 'WC_TWO_FACTOR_REQUIRED');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects WC_SEND_LIMIT_EXCEEDED when the send would breach a configured cap', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    // 1 ETH send @ $2000 → $2000. Per-tx cap = $100.
    const oneEth = '0x' + (10n ** 18n).toString(16);
    await _handleSendTransaction(
      {
        withPrivateKey,
        evmAddress: WALLET_ADDR,
        actionPasswordConfigured: false,
        txLimits: [{ enabled: true, currency: 'ETH', per_transaction_limit: 100 }],
        history: [],
        usdRates: { ETH: 2000 },
      },
      'topic', 91, [{ ...baseTx, value: oneEth }], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 91, 'WC_SEND_LIMIT_EXCEEDED');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('allows the send when 2FA is not configured and no limit is breached', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      {
        withPrivateKey,
        evmAddress: WALLET_ADDR,
        actionPasswordConfigured: false,
        txLimits: [],
        history: [],
        usdRates: { ETH: 2000 },
      },
      'topic', 92, [baseTx], 'eip155:11155111',
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
  });
});
