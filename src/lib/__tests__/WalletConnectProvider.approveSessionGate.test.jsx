// #1105 — WC session approval had NO RASP / step-up gate. Downstream signing
// gates fail-closed, but pairing itself persisted topic + dApp URL and opened
// the relay socket to the peer on a rooted/hooked/attest-failed device.
// Fail closed (I4): consult presignGateOrReject BEFORE approveSession is
// called. TIER.BLOCK → rejectSession + no session persisted.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const presignGate = vi.fn();
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
const approveSession = vi.fn(() => Promise.resolve());
const rejectSession = vi.fn(() => Promise.resolve());
let capturedListener = null;
const onWalletConnectEvent = vi.fn((cb) => { capturedListener = cb; return () => {}; });

vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: (...a) => initWalletConnect(...a),
  onWalletConnectEvent: (...a) => onWalletConnectEvent(...a),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: (...a) => approveSession(...a),
  rejectSession: (...a) => rejectSession(...a),
  respondToRequest: vi.fn(() => Promise.resolve()),
  rejectRequest: vi.fn(() => Promise.resolve()),
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
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(), estimateGas: vi.fn() })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia' })),
}));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: '0xabc' }],
    isUnlocked: true,
    isDecoy: false,
    isHidden: false,
    withPrivateKey: vi.fn(),
    isSendReauthRequired: () => false,
  }),
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

function makeProposal(id) {
  return {
    id,
    params: {
      requiredNamespaces: { eip155: { chains: ['eip155:11155111'] } },
      optionalNamespaces: {},
    },
  };
}

describe('WalletConnectProvider — #1105 session approval RASP gate', () => {
  beforeEach(() => {
    approveSession.mockClear();
    rejectSession.mockClear();
    presignGate.mockReset();
    capturedListener = null;
  });

  it('TIER.BLOCK: rejects the proposal and never persists a session', async () => {
    presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: false });
    const out = renderWithCapture();
    // Feed a session_proposal so pendingProposals contains id=1105.
    await act(async () => {
      capturedListener('session_proposal', makeProposal(1105));
    });
    await act(async () => {
      await out.ctx.approveSession(1105).catch(() => {});
    });
    expect(approveSession).not.toHaveBeenCalled();
    expect(rejectSession).toHaveBeenCalledWith(1105);
  });

  it('TIER.WARN (no ack surface): rejects the proposal, fail-closed', async () => {
    // WC pair path has no biometric-ack affordance, mirrors signing-path RASP-A3.
    presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: true });
    const out = renderWithCapture();
    await act(async () => {
      capturedListener('session_proposal', makeProposal(1106));
    });
    await act(async () => {
      await out.ctx.approveSession(1106).catch(() => {});
    });
    expect(approveSession).not.toHaveBeenCalled();
    expect(rejectSession).toHaveBeenCalledWith(1106);
  });

  it('TIER.ALLOW: approveSession runs as before', async () => {
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
    const out = renderWithCapture();
    await act(async () => {
      capturedListener('session_proposal', makeProposal(1107));
    });
    await act(async () => {
      await out.ctx.approveSession(1107);
    });
    expect(approveSession).toHaveBeenCalledWith(1107, '0xabc', [11155111]);
    expect(rejectSession).not.toHaveBeenCalled();
  });
});
