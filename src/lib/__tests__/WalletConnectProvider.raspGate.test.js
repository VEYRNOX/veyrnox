// src/lib/__tests__/WalletConnectProvider.raspGate.test.js
//
// TDD pin for audit finding RASP-A3 (MEDIUM): the WalletConnect signing path has
// no interactive UI to render a WARN friction dialog, so it must NOT proceed on a
// WARN/CONFIRM tier by passing acknowledged=true. Fail-closed (I4): only a clean
// ALLOW tier proceeds; WARN/CONFIRM reject the WC request with RASP_WARN_REJECTED.
//
// These tests exercise the REAL presignGate (unmocked) so that the acknowledged=true
// bug is actually observable: with the pre-fix code, a WARN tier + acknowledged=true
// returns proceedAllowed=true and the request gets signed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// RASP mock — per-test control of the degraded tier. detect/browserProbeSource are
// inert; degrade() returns the tier the test wants.
const raspState = { tier: 'allow' };
vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' },
  detect: vi.fn(() => ({ condition: 'clean' })),
  degrade: vi.fn(() => ({ tier: raspState.tier })),
  browserProbeSource: {},
}));

// NOTE: presignGate is NOT mocked here — we use the real pure gate so the
// acknowledged bypass is observable end-to-end.

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
  classifyRequest: vi.fn(() => 'PERSONAL_SIGN'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { PERSONAL_SIGN: 'PERSONAL_SIGN', SIGN_TYPED_DATA: 'SIGN_TYPED_DATA', SEND_TRANSACTION: 'SEND_TRANSACTION' },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(() => ({ valid: true, types: { EIP712Domain: [], Mail: [] }, domain: { name: 'Test' }, message: {}, error: null })),
  detectAssetAuthorising: vi.fn(() => null),
  describeTypedData: vi.fn(() => null),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(async () => '0xaa36a7'), estimateGas: vi.fn(async () => 21_000n) })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111 })),
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
  },
}));

import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';

function makeWithPrivateKey(spy) {
  return vi.fn(async (_idx, cb) => { spy(); return cb('0xfakePrivateKey'); });
}

describe('RASP-A3 — WalletConnect signing path is fail-closed on WARN/CONFIRM', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    raspState.tier = 'allow';
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  it('WARN tier → rejects the WC request with RASP_WARN_REJECTED and does NOT sign', async () => {
    raspState.tier = 'warn-before-sign';
    const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
    await _handlePersonalSign({ withPrivateKey }, 'topicW', 9, ['0xdeadbeef', '0xabc']);
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(rejectRequest).toHaveBeenCalledWith('topicW', 9, 'RASP_WARN_REJECTED');
  });

  it('ALLOW tier → WC request proceeds to the signer', async () => {
    raspState.tier = 'allow';
    // H-1 (#745): the signer is only reached with a valid evmAddress bound to a
    // param; a null evmAddress now fails closed. Supply a matching address so this
    // test still exercises the ALLOW-gate → signer path it is about.
    const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
    const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
    await _handlePersonalSign(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topicA', 10,
      ['0xdeadbeef', WALLET_ADDR],
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
    expect(rejectRequest).not.toHaveBeenCalled();
  });
});
