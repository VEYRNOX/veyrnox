// WC pre-sign: Theft Protection enforces the spend-limit gate.
//
// The WC path had NO acknowledgement affordance for a spend-limit breach: any
// breach rejected the request and told the user to complete the send in-app.
// Theft Protection is that missing affordance — a fresh RASP + OS-biometric
// check that, when opted in on a primary session, authorises the over-limit
// send in-band. On failure the request is rejected with a TP-keyed code
// carrying the machine-stable reason from TheftProtectionError.

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
  getFreshRaspArtifact: vi.fn(async () => ({ tier: 'allow' })),
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

// Theft Protection module — inject via the isTheftProtectionEnabled reader and
// the runTheftProtectionGate call. Codes are the contract.
vi.mock('@/lib/theftProtection', async () => {
  const actual = await vi.importActual('@/lib/theftProtection');
  return {
    ...actual,
    isTheftProtectionEnabled: vi.fn(() => false),
    runTheftProtectionGate: vi.fn(async () => {}),
  };
});

import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';
import {
  isTheftProtectionEnabled,
  runTheftProtectionGate,
  TheftProtectionError,
} from '@/lib/theftProtection';

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
const RECIPIENT   = '0x1111222233334444555566667777888899990000';
const NET_CAIP2   = 'eip155:11155111';

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

// A native-ETH send of 10 ETH — priced $2000 → $20,000, well over the $100 cap.
const OVER_LIMIT_TXPARAMS = {
  from: WALLET_ADDR,
  to: RECIPIENT,
  value: '0x' + (10n * 10n ** 18n).toString(16),
  data: '0x',
};

describe('WC + Theft Protection — spend-limit acknowledgement in-band', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  const ctx = (over) => ({
    withPrivateKey,
    evmAddress: WALLET_ADDR,
    actionPasswordConfigured: false,
    history: [],
    usdRates: { ETH: 2000, USDC: 1 },
    txLimits: [{ enabled: true, currency: 'ALL', per_transaction_limit: 100 }],
    isPrimary: true,
    ...over,
  });

  it('TP disabled + over-limit → current WC_SEND_LIMIT_EXCEEDED reject (regression)', async () => {
    vi.mocked(isTheftProtectionEnabled).mockReturnValue(false);
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(ctx(), 'topic', 70, [OVER_LIMIT_TXPARAMS], NET_CAIP2).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 70, 'WC_SEND_LIMIT_EXCEEDED');
    expect(runTheftProtectionGate).not.toHaveBeenCalled();
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('TP enabled + primary + over-limit + gate passes → send proceeds', async () => {
    vi.mocked(isTheftProtectionEnabled).mockReturnValue(true);
    vi.mocked(runTheftProtectionGate).mockResolvedValue(undefined);
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(ctx(), 'topic', 71, [OVER_LIMIT_TXPARAMS], NET_CAIP2);
    expect(runTheftProtectionGate).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: true }));
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
    expect(rejectRequest).not.toHaveBeenCalled();
  });

  it('TP enabled + gate declines → WC_SEND_THEFT_PROTECTION_FAILED carrying the reason', async () => {
    vi.mocked(isTheftProtectionEnabled).mockReturnValue(true);
    vi.mocked(runTheftProtectionGate).mockRejectedValue(new TheftProtectionError('declined'));
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(ctx(), 'topic', 72, [OVER_LIMIT_TXPARAMS], NET_CAIP2).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 72, 'WC_SEND_THEFT_PROTECTION_FAILED');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('TP enabled but not primary (decoy/hidden) → falls back to hard reject (I3: no TP prompt)', async () => {
    vi.mocked(isTheftProtectionEnabled).mockReturnValue(true);
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(ctx({ isPrimary: false }), 'topic', 73, [OVER_LIMIT_TXPARAMS], NET_CAIP2).catch(() => {});
    expect(runTheftProtectionGate).not.toHaveBeenCalled();
    expect(rejectRequest).toHaveBeenCalledWith('topic', 73, 'WC_SEND_LIMIT_EXCEEDED');
  });

  it('TP enabled + no limit breach → gate NOT invoked (no unrelated Face ID prompt)', async () => {
    vi.mocked(isTheftProtectionEnabled).mockReturnValue(true);
    vi.mocked(runTheftProtectionGate).mockResolvedValue(undefined);
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      ctx({ txLimits: [{ enabled: true, currency: 'ALL', per_transaction_limit: 100000 }] }),
      'topic', 74,
      [OVER_LIMIT_TXPARAMS],
      NET_CAIP2,
    );
    expect(runTheftProtectionGate).not.toHaveBeenCalled();
    expect(withPrivateKeySpy).toHaveBeenCalled();
  });
});
