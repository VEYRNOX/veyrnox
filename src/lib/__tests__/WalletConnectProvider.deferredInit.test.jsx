// #1099 — WC relay socket auto-opens on unlock. Historically the provider's
// useEffect called initWalletConnect() as soon as an unlocked, non-decoy vault
// mounted this provider — opening a WebSocket to relay.walletconnect.com with
// zero pairing or signing intent. That is a silent I2 egress ("app-in-use"
// beacon) and violates I3 whenever a stale/persisted WC config coexists with a
// decoy session. Fix: defer relay init to the first explicit pair/approve
// intent, and gate any init on isDeniabilityOrDemoActive().

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const presignGate = vi.fn(() => ({ proceedAllowed: true, signerReachable: true }));
vi.mock('@/sign-gate/presign', () => ({ presignGate: (...a) => presignGate(...a) }));
vi.mock('@/rasp', () => ({
  detect: vi.fn(() => ({})),
  degrade: vi.fn(() => ({ tier: 'allow' })),
  TIER: { ALLOW: 'allow', BLOCK: 'block' },
  browserProbeSource: {},
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));
vi.mock('@/risk/levels', () => ({ LEVEL: { OK: 'ok' } }));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const initWalletConnect = vi.fn(() => Promise.resolve());
const pairWithDapp = vi.fn(() => Promise.resolve());
const onWalletConnectEvent = vi.fn(() => () => {});
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: (...a) => initWalletConnect(...a),
  onWalletConnectEvent: (...a) => onWalletConnectEvent(...a),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: vi.fn(() => Promise.resolve()),
  rejectSession: vi.fn(() => Promise.resolve()),
  respondToRequest: vi.fn(() => Promise.resolve()),
  rejectRequest: vi.fn(() => Promise.resolve()),
  disconnectSession: vi.fn(),
  pairWithDapp: (...a) => pairWithDapp(...a),
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
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(), estimateGas: vi.fn() })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia' })),
}));

// isDeniabilityOrDemoActive() — belt-and-braces I3 guard on pair. Default false.
const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: (...a) => isDeniabilityOrDemoActive(...a),
}));

let mockWallet;
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => mockWallet,
}));
vi.mock('ethers', () => ({
  ethers: { Wallet: class {}, getBytes: (x) => x, isAddress: () => true },
}));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';

function renderWithCapture() {
  const out = {};
  function Grab() { out.ctx = useWalletConnect(); return null; }
  render(<WalletConnectProvider><Grab /></WalletConnectProvider>);
  return out;
}

describe('WalletConnectProvider — #1099 relay deferred until explicit intent', () => {
  beforeEach(() => {
    initWalletConnect.mockClear();
    pairWithDapp.mockClear();
    isDeniabilityOrDemoActive.mockReset();
    isDeniabilityOrDemoActive.mockReturnValue(false);
    mockWallet = {
      accounts: [{ address: '0xabc' }],
      isUnlocked: true,
      isDecoy: false,
      isHidden: false,
      withPrivateKey: vi.fn(),
      isSendReauthRequired: () => false,
    };
  });

  it('does NOT call initWalletConnect on unlock in a normal session', () => {
    renderWithCapture();
    expect(initWalletConnect).not.toHaveBeenCalled();
  });

  it('does NOT call initWalletConnect on unlock in a decoy session', () => {
    mockWallet = { ...mockWallet, isDecoy: true };
    renderWithCapture();
    expect(initWalletConnect).not.toHaveBeenCalled();
  });

  it('calls initWalletConnect exactly once when user pairs explicitly', async () => {
    const out = renderWithCapture();
    await act(async () => { await out.ctx.pair('wc:uri@2?relay=...'); });
    expect(initWalletConnect).toHaveBeenCalledTimes(1);
    expect(pairWithDapp).toHaveBeenCalledWith('wc:uri@2?relay=...');
  });

  it('pair is I3-gated: does NOT init or pair when isDeniabilityOrDemoActive() is true', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const out = renderWithCapture();
    await act(async () => { await out.ctx.pair('wc:uri@2?relay=...').catch(() => {}); });
    expect(initWalletConnect).not.toHaveBeenCalled();
    expect(pairWithDapp).not.toHaveBeenCalled();
  });
});
