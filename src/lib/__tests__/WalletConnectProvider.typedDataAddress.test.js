// src/lib/__tests__/WalletConnectProvider.typedDataAddress.test.js
//
// TDD pin for issue #1092: WC eth_signTypedData_v4 must bind params[0] (signer
// address) to the active EVM address. Currently _handleSignTypedData only
// enforces H7 chain-ID binding — a dApp naming a foreign address in params[0]
// would still receive a signature attributed to our active key. Reject with
// TYPED_DATA_ADDRESS_MISMATCH before the key is touched (fail closed, I4).

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
  classifyRequest: vi.fn(() => 'SIGN_TYPED_DATA'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { PERSONAL_SIGN: 'PERSONAL_SIGN', SIGN_TYPED_DATA: 'SIGN_TYPED_DATA', SEND_TRANSACTION: 'SEND_TRANSACTION' },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(() => ({
    valid: true,
    types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Mail: [] },
    domain: { chainId: 11155111 },
    message: { from: '0x0' },
    error: null,
  })),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(async () => '0xaa36a7'),
    estimateGas: vi.fn(async () => 21_000n),
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
const TYPED_JSON  = JSON.stringify({
  types: { EIP712Domain: [], Mail: [] },
  domain: { chainId: 11155111 },
  message: { from: '0x0' },
  primaryType: 'Mail',
});

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

describe('#1092 — WC eth_signTypedData_v4 binds params[0] to active EVM address', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  it('rejects TYPED_DATA_ADDRESS_MISMATCH when params[0] is a foreign address (fail closed, I4)', async () => {
    const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
    await _handleSignTypedData(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topic', 92, [OTHER_ADDR, TYPED_JSON], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 92, 'TYPED_DATA_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects TYPED_DATA_ADDRESS_MISMATCH when params[0] is absent (fail closed, I4)', async () => {
    const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
    await _handleSignTypedData(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topic', 93, [undefined, TYPED_JSON], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 93, 'TYPED_DATA_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects TYPED_DATA_ADDRESS_MISMATCH when evmAddress is null (fail closed, I4)', async () => {
    const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
    await _handleSignTypedData(
      { withPrivateKey, evmAddress: null },
      'topic', 94, [WALLET_ADDR, TYPED_JSON], 'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 94, 'TYPED_DATA_ADDRESS_MISMATCH');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('allows when params[0] matches evmAddress (case-insensitive)', async () => {
    const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
    await _handleSignTypedData(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topic', 95, [WALLET_ADDR.toLowerCase(), TYPED_JSON], 'eip155:11155111',
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
  });
});
