// src/lib/__tests__/WalletConnectProvider.sessionApprovalReauthGate.test.jsx
//
// Regression pin for audit finding L-4 (2026-07-28 internal audit).
//
// `handleApproveSession` enforced the presign RASP gate (H-1 fix, PR #1276) but
// did not enforce the H-NEW-B step-up re-auth window that the three signing
// chokepoints already read. A dApp session approved inside a stale-reauth window
// could then request signing — the per-request gate exists, but the connection
// itself sidestepped H-NEW-B. Fail closed (I4).
//
// These tests mock the RASP gate to ALLOW and toggle isSendReauthRequired() so
// the reauth branch is what is under test.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const raspState = { tier: 'allow' };
vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' },
  detect: vi.fn(() => 'clean'),
  degrade: vi.fn(() => ({ tier: raspState.tier })),
  browserProbeSource: {},
  nativeProbeSource: vi.fn(async () => ({ available: false })),
  selectPresignProbeSource: vi.fn((_isNative, _native, browser) => browser),
  attestationProbeSource: vi.fn(async () => ({ available: false })),
  detectAttestation: vi.fn(() => 'clean'),
  composeConditions: vi.fn((a) => a),
  ATTESTATION_ENABLED: false,
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));

let wcEventCb = null;
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(async () => {}),
  onWalletConnectEvent: vi.fn((cb) => { wcEventCb = cb; return () => {}; }),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
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
  REQUEST_TYPES: {
    PERSONAL_SIGN: 'PERSONAL_SIGN',
    SIGN_TYPED_DATA: 'SIGN_TYPED_DATA',
    SEND_TRANSACTION: 'SEND_TRANSACTION',
    UNKNOWN: 'UNKNOWN',
  },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(() => ({ valid: true, types: {}, domain: {}, message: {}, error: null })),
  detectAssetAuthorising: vi.fn(() => null),
  describeTypedData: vi.fn(() => null),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(async () => '0xaa36a7'), estimateGas: vi.fn(async () => 21_000n) })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111 })),
}));

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
const reauthState = { required: false };
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: WALLET_ADDR }],
    isUnlocked: true,
    isDecoy: false,
    isHidden: false,
    withPrivateKey: vi.fn(),
    isSendReauthRequired: vi.fn(() => reauthState.required),
    actionPasswordConfigured: false,
  }),
}));

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
  isDeniabilitySessionActive: vi.fn(() => false),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { approveSession } from '@/wallet-core/evm/walletconnect/session.js';

const PROPOSAL = {
  id: 5151,
  params: {
    proposer: { metadata: { name: 'Test dApp', url: 'https://dapp.example' } },
    requiredNamespaces: { eip155: { chains: ['eip155:11155111'] } },
  },
};

async function setup() {
  const out = {};
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Grab() {
    out.ctx = useWalletConnect();
    return null;
  }
  await act(async () => {
    render(
      <QueryClientProvider client={qc}>
        <WalletConnectProvider>
          <Grab />
        </WalletConnectProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => { wcEventCb?.('session_proposal', PROPOSAL); });
  return out;
}

describe('L-4 — WalletConnect session approval enforces step-up re-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wcEventCb = null;
    raspState.tier = 'allow';
    reauthState.required = false;
  });

  it('reauth required → approval throws and approveSession() is never called', async () => {
    reauthState.required = true;
    const out = await setup();
    expect(out.ctx.pendingProposals).toHaveLength(1);

    await expect(
      act(async () => { await out.ctx.approveSession(PROPOSAL.id); }),
    ).rejects.toThrow(/step-up|re-auth/i);

    expect(approveSession).not.toHaveBeenCalled();
  });

  it('reauth fresh → approval proceeds as normal', async () => {
    reauthState.required = false;
    const out = await setup();

    await act(async () => { await out.ctx.approveSession(PROPOSAL.id); });

    expect(approveSession).toHaveBeenCalledWith(PROPOSAL.id, WALLET_ADDR, [11155111]);
  });
});
