// Regression guard for audit finding H-1 (issue #745) in WalletConnectProvider.jsx.
//
// H-1: _handlePersonalSign wrapped the H8 address-binding check in
//   if (evmAddress) { ...bind... } else { hexMsg = arr[0]; }
// The else branch proceeded to withPrivateKey with ZERO address verification when
// evmAddress was null (no active wallet address). A dApp could then obtain a
// signature over an arbitrary payload with no binding to the wallet's own address.
//
// Fix (fail closed, I4): when evmAddress is null/falsy, reject the request with
// PERSONAL_SIGN_ADDRESS_MISMATCH and never touch the key — identical to the
// address-present-but-mismatched path.
//
// We call the exported _handlePersonalSign directly (its collaborators — the RASP
// gate and the session reject/respond calls — are mocked) so the null-evmAddress
// branch is exercised in isolation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// RASP gate: force a clean ALLOW so the gate is not what stops the null path.
const presignGate = vi.fn(() => ({ proceedAllowed: true, signerReachable: true }));
vi.mock('@/sign-gate/presign', () => ({ presignGate: (...a) => presignGate(...a) }));
// H-1 (#950): presignGateOrReject now imports the full native-aware surface. Stub
// every export so the pipeline reaches degrade() (mocked to ALLOW) without hitting
// undefined. This test's focus is the null evmAddress branch, not the RASP gate.
vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' },
  detect: vi.fn(() => 'clean'),
  degrade: vi.fn(() => ({ tier: 'allow' })),
  browserProbeSource: {},
  nativeProbeSource: vi.fn(async () => ({ available: false })),
  selectPresignProbeSource: vi.fn((_isNative, _native, browser) => browser),
  attestationProbeSource: vi.fn(async () => ({ available: false })),
  detectAttestation: vi.fn(() => 'clean'),
  composeConditions: vi.fn((a) => a),
  ATTESTATION_ENABLED: false,
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));
vi.mock('@/risk/levels', () => ({ LEVEL: { OK: 'ok' } }));

// session.js: capture reject/respond call counts.
const respondToRequest = vi.fn(() => Promise.resolve());
const rejectRequest = vi.fn(() => Promise.resolve());
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(() => Promise.resolve()),
  onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: vi.fn(),
  rejectSession: vi.fn(),
  respondToRequest: (...a) => respondToRequest(...a),
  rejectRequest: (...a) => rejectRequest(...a),
  disconnectSession: vi.fn(),
  pairWithDapp: vi.fn(),
}));

vi.mock('@/wallet-core/evm/walletconnect/router.js', () => ({
  classifyRequest: vi.fn(),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { SIGN_TYPED_DATA: 'sign_typed_data' },
}));
vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));
vi.mock('@/wallet-core/evm/provider.js', () => ({ getProvider: vi.fn() }));
vi.mock('@/wallet-core/evm/networks.js', () => ({ getNetworkByChainId: vi.fn() }));
vi.mock('@/lib/WalletProvider.jsx', () => ({ useWallet: () => ({}) }));

vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor() {}
      signMessage() { return Promise.resolve('0xsig'); }
    },
    getBytes: (x) => x,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v),
  },
}));

import { _handlePersonalSign } from '@/lib/WalletConnectProvider.jsx';

describe('WalletConnectProvider — H-1 (#745): null evmAddress must reject, never sign', () => {
  beforeEach(() => {
    respondToRequest.mockClear();
    rejectRequest.mockClear();
    presignGate.mockClear();
  });

  it('rejects PERSONAL_SIGN_ADDRESS_MISMATCH and never signs when evmAddress is null', async () => {
    const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
    await expect(
      _handlePersonalSign(
        { withPrivateKey, evmAddress: null },
        'topicNull', 300,
        ['0xdeadbeef', '0xabc'],
      ),
    ).rejects.toThrow(/PERSONAL_SIGN_ADDRESS_MISMATCH/);

    expect(rejectRequest).toHaveBeenCalledWith('topicNull', 300, 'PERSONAL_SIGN_ADDRESS_MISMATCH');
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
  });

  it('rejects PERSONAL_SIGN_ADDRESS_MISMATCH and never signs when evmAddress is undefined', async () => {
    const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
    await expect(
      _handlePersonalSign(
        { withPrivateKey, evmAddress: undefined },
        'topicUndef', 301,
        ['0xdeadbeef', '0xabc'],
      ),
    ).rejects.toThrow(/PERSONAL_SIGN_ADDRESS_MISMATCH/);

    expect(rejectRequest).toHaveBeenCalledWith('topicUndef', 301, 'PERSONAL_SIGN_ADDRESS_MISMATCH');
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
  });

  it('still signs when evmAddress is present and matches (regression guard for the fix)', async () => {
    const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
    await _handlePersonalSign(
      { withPrivateKey, evmAddress: '0xabc' },
      'topicOk', 302,
      ['0xdeadbeef', '0xabc'], // [message, ownAddress] — EIP-1474 order
    );
    expect(withPrivateKey).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalledWith('topicOk', 302, '0xsig');
    expect(rejectRequest).not.toHaveBeenCalled();
  });

  it('still rejects when evmAddress is present but no param matches it', async () => {
    const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
    await expect(
      _handlePersonalSign(
        { withPrivateKey, evmAddress: '0xabc' },
        'topicMismatch', 303,
        ['0xdeadbeef', '0xdef'], // neither param is 0xabc
      ),
    ).rejects.toThrow(/PERSONAL_SIGN_ADDRESS_MISMATCH/);
    expect(rejectRequest).toHaveBeenCalledWith('topicMismatch', 303, 'PERSONAL_SIGN_ADDRESS_MISMATCH');
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
  });
});
