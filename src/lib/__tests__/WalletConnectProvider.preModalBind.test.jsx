// src/lib/__tests__/WalletConnectProvider.preModalBind.test.jsx
//
// Weekly-audit 2026-08-25 LOW findings on the WC session_request path — the code
// that runs BEFORE the approval modal is rendered.
//
//   L-1: enrichRequest destructured `req.params.request` non-defensively while
//        the handler that queues the item optional-chains the identical access
//        and lets a method-less request through the permissive `else`. A queued
//        request with no `params.request` therefore threw during render of the
//        whole provider subtree. Availability only (no signature, no funds);
//        pinned on the internal-inconsistency ground.
//
//   L-2: the pre-modal H7 chain bind used JSON.parse where sign time uses
//        parseTypedData. dApps routinely send params[1] as an OBJECT;
//        JSON.parse(object) throws, so the bind was silently skipped and the
//        user walked a whole approval modal before sign time rejected it.
//
//   L-3: eth_sendTransaction validated `from` pre-modal and nothing else, so a
//        chain the session never approved reached the modal and was only caught
//        at sign time by resolveSessionCaip2.
//
// These assert machine codes (SESSION_CHAINID_INVALID / CHAIN_ID_MISMATCH) and
// queue membership, never modal copy.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/demoClient', () => ({
  DEMO: false,
  demoBase44: {
    auth: { logout: vi.fn() },
    functions: {},
    integrations: { Core: { InvokeLLM: vi.fn() } },
    entities: {},
  },
}));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(() => ({ proceedAllowed: true, signerReachable: true })),
}));
vi.mock('@/rasp', () => ({
  detect: vi.fn(() => ({})),
  degrade: vi.fn(() => ({ tier: 'allow' })),
  detectAttestation: vi.fn(() => ({})),
  composeConditions: vi.fn((a) => a),
  selectPresignProbeSource: vi.fn(() => ({})),
  nativeProbeSource: vi.fn(),
  attestationProbeSource: vi.fn(),
  ATTESTATION_ENABLED: false,
  TIER: { ALLOW: 'allow', BLOCK: 'block' },
  browserProbeSource: {},
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));

// The live session store: one session on Sepolia only.
const SEPOLIA = 'eip155:11155111';
const MAINNET = 'eip155:1';
const TOPIC = 'topic-1';
const SESSION = {
  topic: TOPIC,
  expiry: Math.floor(Date.now() / 1000) + 3600,
  namespaces: { eip155: { chains: [SEPOLIA] } },
  peer: { metadata: { name: 'dApp', url: 'https://dapp.example' } },
};

let capturedHandler = null;
const rejectRequest = vi.fn(async () => {});
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(async () => {}),
  onWalletConnectEvent: vi.fn((cb) => { capturedHandler = cb; return () => {}; }),
  getActiveSessions: vi.fn(() => [SESSION]),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: vi.fn(async () => {}),
  rejectSession: vi.fn(async () => {}),
  respondToRequest: vi.fn(async () => {}),
  rejectRequest: (...a) => rejectRequest(...a),
  disconnectSession: vi.fn(async () => {}),
  pairWithDapp: vi.fn(async () => {}),
}));

// router.js and typed-data.js are REAL here — the point of L-2 is which parser
// the pre-modal branch calls, so mocking it away would assert nothing.
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(), estimateGas: vi.fn() })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111, symbol: 'ETH' })),
}));
vi.mock('@/api/trackEvent', () => ({ trackEvent: vi.fn(async () => {}), EVENT: {} }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: WALLET_ADDR }],
    isUnlocked: true,
    isDecoy: false,
    isHidden: false,
    withPrivateKey: vi.fn(),
    isSendReauthRequired: () => false,
    actionPasswordConfigured: false,
  }),
}));

vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {},
    getBytes: (x) => x,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
    getAddress: (v) => v,
  },
}));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';

function renderWithCapture() {
  const out = {};
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Grab() {
    out.ctx = useWalletConnect();
    return null;
  }
  render(
    <QueryClientProvider client={qc}>
      <WalletConnectProvider>
        <Grab />
      </WalletConnectProvider>
    </QueryClientProvider>,
  );
  return out;
}

function fireRequest(data) {
  act(() => { capturedHandler('session_request', data); });
}

const typedData = (chainId) => ({
  types: { EIP712Domain: [], Mail: [] },
  primaryType: 'Mail',
  domain: { name: 'dApp', chainId },
  message: { from: '0x0' },
});

describe('WC pre-modal binds (L-1, L-2, L-3)', () => {
  beforeEach(() => {
    capturedHandler = null;
    rejectRequest.mockClear();
  });

  // ---- L-1 -----------------------------------------------------------------
  it('L-1: a queued request with no params.request enriches to UNKNOWN instead of throwing', () => {
    const out = renderWithCapture();
    fireRequest({ topic: TOPIC, id: 1, params: {} });
    expect(out.ctx.pendingRequests).toHaveLength(1);
    expect(out.ctx.pendingRequests[0].type).toBe('unknown');
    expect(out.ctx.pendingRequests[0].blocked).toBe(false);
  });

  // ---- L-2 -----------------------------------------------------------------
  it('L-2: rejects CHAIN_ID_MISMATCH pre-modal when typed data arrives as an OBJECT', () => {
    const out = renderWithCapture();
    fireRequest({
      topic: TOPIC,
      id: 2,
      params: {
        chainId: SEPOLIA,
        request: { method: 'eth_signTypedData_v4', params: [WALLET_ADDR, typedData(1)] },
      },
    });
    expect(rejectRequest).toHaveBeenCalledWith(TOPIC, 2, 'CHAIN_ID_MISMATCH');
    expect(out.ctx.pendingRequests).toHaveLength(0);
  });

  it('L-2: queues an OBJECT payload whose hex domain.chainId matches the session chain', () => {
    const out = renderWithCapture();
    fireRequest({
      topic: TOPIC,
      id: 3,
      params: {
        chainId: SEPOLIA,
        request: { method: 'eth_signTypedData_v4', params: [WALLET_ADDR, typedData('0xaa36a7')] },
      },
    });
    expect(rejectRequest).not.toHaveBeenCalled();
    expect(out.ctx.pendingRequests).toHaveLength(1);
  });

  it('L-2: a JSON-string payload still binds the chain (unchanged behaviour)', () => {
    const out = renderWithCapture();
    fireRequest({
      topic: TOPIC,
      id: 4,
      params: {
        chainId: SEPOLIA,
        request: { method: 'eth_signTypedData_v4', params: [WALLET_ADDR, JSON.stringify(typedData(1))] },
      },
    });
    expect(rejectRequest).toHaveBeenCalledWith(TOPIC, 4, 'CHAIN_ID_MISMATCH');
    expect(out.ctx.pendingRequests).toHaveLength(0);
  });

  // ---- L-3 -----------------------------------------------------------------
  it('L-3: rejects SESSION_CHAINID_INVALID pre-modal for a chain the session never approved', () => {
    const out = renderWithCapture();
    fireRequest({
      topic: TOPIC,
      id: 5,
      params: {
        chainId: MAINNET,
        request: { method: 'eth_sendTransaction', params: [{ from: WALLET_ADDR, to: WALLET_ADDR, value: '0x0' }] },
      },
    });
    expect(rejectRequest).toHaveBeenCalledWith(TOPIC, 5, 'SESSION_CHAINID_INVALID');
    expect(out.ctx.pendingRequests).toHaveLength(0);
  });

  it('L-3: queues a send on the session-approved chain', () => {
    const out = renderWithCapture();
    fireRequest({
      topic: TOPIC,
      id: 6,
      params: {
        chainId: SEPOLIA,
        request: { method: 'eth_sendTransaction', params: [{ from: WALLET_ADDR, to: WALLET_ADDR, value: '0x0' }] },
      },
    });
    expect(rejectRequest).not.toHaveBeenCalled();
    expect(out.ctx.pendingRequests).toHaveLength(1);
  });
});
