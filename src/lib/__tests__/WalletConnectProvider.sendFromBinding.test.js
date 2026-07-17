// src/lib/__tests__/WalletConnectProvider.sendFromBinding.test.js
//
// TDD pin for issue #1091: WC eth_sendTransaction must bind txParams.from to
// the active EVM address (mirrors H8 for personal_sign). A dApp requesting a
// send FROM a foreign address, or omitting `from` entirely, MUST reject with
// SEND_ADDRESS_MISMATCH before the key is touched (fail closed, I4).

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
const OTHER_ADDR  = '0x9999888877776666555544443333222211110000';
const RECIPIENT   = '0x1111222233334444555566667777888899990000';

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

describe('#1091 — WC eth_sendTransaction binds txParams.from to active EVM address', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('rejects SEND_ADDRESS_MISMATCH when from is a foreign address (fail closed, I4)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 91, [{ from: OTHER_ADDR, to: RECIPIENT, value: '0x0', data: '0x' }], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 91, 'SEND_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects SEND_ADDRESS_MISMATCH when from is absent (fail closed, I4)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 92, [{ to: RECIPIENT, value: '0x0', data: '0x' }], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 92, 'SEND_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects SEND_ADDRESS_MISMATCH when evmAddress is null (fail closed, I4)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      { ...deps(), evmAddress: null },
      'topic', 93, [{ from: WALLET_ADDR, to: RECIPIENT, value: '0x0', data: '0x' }], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 93, 'SEND_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('allows the send when from matches evmAddress (case-insensitive)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      deps(),
      'topic', 94, [{ from: WALLET_ADDR.toLowerCase(), to: RECIPIENT, value: '0x0', data: '0x' }], 'eip155:11155111',
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
  });
});
