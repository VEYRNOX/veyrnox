// src/lib/__tests__/WalletConnectProvider.sessionApprovalRaspGate.test.jsx
//
// Regression pin for audit finding H-1 (docs/audit-2026-07-20-weekly.md).
//
// `handleApproveSession` called presignGateOrReject() and then checked
// `gate.blocked` / `gate.sentence` — two properties that function has NEVER
// returned (it returns `{ proceedAllowed, rejectCode }`). Both were permanently
// `undefined`, so the condition was always false and EVERY WalletConnect session
// approval proceeded regardless of RASP tier, including a hard TIER.BLOCK from a
// rooted / hooked / emulated / tampered device.
//
// The three signing handlers read `gate.proceedAllowed` correctly; this was the
// only call site reading the wrong shape, and no test exercised the branch, so it
// shipped broken in the commit that added it (7cdeee64, #1105) and stayed broken.
//
// These tests exercise the REAL presignGate (unmocked) so the property mismatch is
// observable end-to-end: the RASP mock's degrade() drives the tier, presignGate
// turns that into { proceedAllowed: false }, and the assertion is on whether
// approveSession() — the real side effect — was reached.
//
// I4 (fail honest, fail closed): a device that fails the integrity check must not
// be able to approve a new dApp session.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

// RASP mock — per-test control of the degraded tier, mirroring
// WalletConnectProvider.raspGate.test.js. presignGate itself is NOT mocked: the
// real pure gate is what converts a BLOCK tier into proceedAllowed:false, and it
// is that value the fix must read.
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

// Capture the provider's WC event callback so the test can push a real
// session_proposal into pendingProposals — without one, handleApproveSession
// would throw 'Proposal not found' and the test could not distinguish the RASP
// rejection from an unrelated failure.
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

// A real, unlocked, non-deniability wallet — so the relay-init effect runs and the
// event subscription is registered, and so evmAddress is non-null (otherwise
// handleApproveSession would fail on the address check rather than the RASP gate).
const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: WALLET_ADDR }],
    isUnlocked: true,
    isDecoy: false,
    isHidden: false,
    withPrivateKey: vi.fn(),
    isSendReauthRequired: vi.fn(() => false),
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
  id: 4242,
  params: {
    proposer: { metadata: { name: 'Test dApp', url: 'https://dapp.example' } },
    requiredNamespaces: { eip155: { chains: ['eip155:11155111'] } },
  },
};

// Render the provider, register a pending proposal via the real event path, and
// hand back the context's approveSession (i.e. handleApproveSession).
async function setup() {
  const out = {};
  function Grab() {
    out.ctx = useWalletConnect();
    return null;
  }
  await act(async () => {
    render(
      <WalletConnectProvider>
        <Grab />
      </WalletConnectProvider>,
    );
  });
  // Push a genuine session_proposal through the provider's own event handler.
  await act(async () => { wcEventCb?.('session_proposal', PROPOSAL); });
  return out;
}

describe('H-1 — WalletConnect session approval is fail-closed on a non-ALLOW RASP tier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wcEventCb = null;
    raspState.tier = 'allow';
  });

  it('BLOCK tier → approval throws and approveSession() is never called', async () => {
    raspState.tier = 'block-signing';
    const out = await setup();
    expect(out.ctx.pendingProposals).toHaveLength(1); // proposal really registered

    await expect(
      act(async () => { await out.ctx.approveSession(PROPOSAL.id); }),
    ).rejects.toThrow(/integrity|refused/i);

    expect(approveSession).not.toHaveBeenCalled();
  });

  it('WARN tier → approval throws and approveSession() is never called', async () => {
    // The WC surface has no interactive friction dialog, so anything short of a
    // clean ALLOW must refuse (same posture as the signing handlers, RASP-A3).
    raspState.tier = 'warn-before-sign';
    const out = await setup();

    await expect(
      act(async () => { await out.ctx.approveSession(PROPOSAL.id); }),
    ).rejects.toThrow(/integrity|refused/i);

    expect(approveSession).not.toHaveBeenCalled();
  });

  it('ALLOW tier → approval proceeds and approveSession() is called with the wallet address and parsed chain ids', async () => {
    raspState.tier = 'allow';
    const out = await setup();

    await act(async () => { await out.ctx.approveSession(PROPOSAL.id); });

    expect(approveSession).toHaveBeenCalledWith(PROPOSAL.id, WALLET_ADDR, [11155111]);
  });
});
