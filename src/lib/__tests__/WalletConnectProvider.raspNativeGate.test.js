// src/lib/__tests__/WalletConnectProvider.raspNativeGate.test.js
//
// TDD pin for issue #950 (RASP H-1): the WalletConnect pre-sign gate must NOT
// read only `browserProbeSource`. On a native Capacitor WebView browserProbe
// hard-codes rooted/emulator/tampered = false, so the current sync gate resolves
// CLEAN → ALLOW and every WC signing handler reaches withPrivateKey with zero
// RASP friction on a rooted/hooked/emulated/Play-Integrity-failed device.
//
// The fix mirrors the Send path (SendCrypto.jsx / useRaspArtifact):
//   detect(selectPresignProbeSource(isNative, nativeProbe, browserProbeSource))
//   composed with attestation via composeConditions.
//
// I4 fail-closed: the WC handler is invoked from an async WC event (not React
// render), so both probes are awaited at gate time. During any in-flight bridge
// call — and on any throw/timeout — the source is treated as UNAVAILABLE
// (WARN → RASP_WARN_REJECTED). The signer is NEVER reached under WARN/BLOCK.
//
// Cases pinned:
//   T1 native + rooted native probe → REJECTED with RASP_WARN_REJECTED
//   T2 native + attestation INTEGRITY_FAIL → REJECTED with RASP_BLOCK
//   T3 native + native probe returns UNAVAILABLE (not sampled / bridge threw) →
//      REJECTED with RASP_WARN_REJECTED (composed with attestation UNAVAILABLE)
//   T4 native + clean native probe + clean attestation → ALLOWS (regression pin
//      that the honest ALLOW path still works after the wiring change).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate a Capacitor native WebView so the SUT branches into the native leg.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

// Keep the real detect/degrade/selectPresignProbeSource/composeConditions/etc.
// pure helpers — only the two async probe sources are controllable per test.
// This is what makes the assertions bite: the CURRENT sync SUT reads only
// browserProbeSource (mocked to simulate a native WebView: available:true with
// all-false signals) and resolves CLEAN → ALLOW, so T1/T2/T3 fail on the
// pre-fix code (the signer is reached / no rejection is emitted).
const nativeProbeSource = vi.fn();
const attestationProbeSource = vi.fn();
vi.mock('@/rasp', async () => {
  const actual = await vi.importActual('@/rasp');
  return {
    ...actual,
    // Simulate a Capacitor WebView: window present ⇒ available:true, but
    // browser cannot observe root/emulator/tampered so signals are all false.
    // This is the exact fail-open shape from the H-1 issue.
    browserProbeSource: {
      get available() { return true; },
      get signals() { return { hooked: false, tampered: false, emulator: false, rooted: false }; },
    },
    nativeProbeSource: (...args) => nativeProbeSource(...args),
    attestationProbeSource: (...args) => attestationProbeSource(...args),
  };
});

// WalletConnect session helpers — minimal stubs so we can observe reject/respond.
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

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';

function makeWithPrivateKey(spy) {
  return vi.fn(async (_idx, cb) => { spy(); return cb('0xfakePrivateKey'); });
}

describe('issue #950 — WC pre-sign gate is native-aware (H-1 fail-open closed)', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: attestation returns unavailable (as if disabled / bridge absent);
    // per-test overrides where relevant.
    attestationProbeSource.mockResolvedValue({ available: false });
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  it('T1 — native + rooted native probe → REJECTED (RASP_WARN_REJECTED), key never touched', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: true, hooked: false, emulator: false, tampered: false },
    });
    const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
    await _handlePersonalSign(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topicR', 1,
      ['0xdeadbeef', WALLET_ADDR],
    );
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(rejectRequest).toHaveBeenCalledWith('topicR', 1, 'RASP_WARN_REJECTED');
  });

  it('T2 — native + attestation INTEGRITY_FAIL → REJECTED (RASP_BLOCK), key never touched', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: true });
    const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
    await _handlePersonalSign(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topicI', 2,
      ['0xdeadbeef', WALLET_ADDR],
    );
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(rejectRequest).toHaveBeenCalledWith('topicI', 2, 'RASP_BLOCK');
  });

  it('T3 — native + native probe UNAVAILABLE (not sampled / bridge threw) → REJECTED (RASP_WARN_REJECTED)', async () => {
    // Bridge threw → probe fails closed to {available:false}. This is exactly
    // the "native leg null / not-yet-sampled" case from the issue: the browser
    // leg must NOT be substituted (fail-open), so the gate must reject.
    nativeProbeSource.mockRejectedValue(new Error('bridge unavailable'));
    // Attestation also unavailable; composed condition stays INTEGRITY_UNAVAILABLE.
    attestationProbeSource.mockResolvedValue({ available: false });
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction({ withPrivateKey }, 'topicU', 3,
      [{ to: '0xrecipient', value: '0x0', data: '0x' }], 'eip155:11155111');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(rejectRequest).toHaveBeenCalledWith('topicU', 3, 'RASP_WARN_REJECTED');
  });

  it('T4 — native + clean native probe + clean attestation → ALLOWS (regression pin)', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });
    const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
    await _handlePersonalSign(
      { withPrivateKey, evmAddress: WALLET_ADDR },
      'topicC', 4,
      ['0xdeadbeef', WALLET_ADDR],
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
    expect(rejectRequest).not.toHaveBeenCalled();
  });
});
