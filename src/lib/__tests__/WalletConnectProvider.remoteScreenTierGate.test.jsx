// src/lib/__tests__/WalletConnectProvider.remoteScreenTierGate.test.jsx
//
// Audit 2026-09-07 M-2 (I2 — no silent data egress).
//
// THE HOLE. Three of the four call sites that enable the TIP remote screen AND
// it with `advisorOnline` (SendCrypto.jsx:858 and :873, RequestApprovalModal
// .jsx:68). The WalletConnect SIGNING path did not — it passed
// `readRemoteScreenPreference(...)` straight through. That helper DEFAULTS to
// the configured state when the user has stored no preference, so a Free or
// Safety Plus user's WalletConnect send POSTed recipient address, calldata,
// value and chain to tip-screen at sign time, with a stable X-Rc-User-Id
// attached (tipClient.js).
//
// What made it SILENT rather than merely ungated: the modal is the disclosure
// surface, and it computes its own `remoteScreenEnabled` WITH the tier gate. For
// exactly this cohort both notices were suppressed — the "screening is on" one
// (needs remoteScreenEnabled) and the "screening unavailable" one (needs
// remoteScreenRequested) — so the egress had no user-visible surface at all.
//
// This file asserts the GATE, at the seam where the decision is actually made:
// what `buildWcTransactionIntelligence` receives for `remoteScreenEnabled`, which
// is the flag it uses to decide whether to call out (`tipApplicable`,
// walletConnectIntel.js:75).
//
// Mutation-checked: dropping the `hasAdvisorOnlineAccessCached() &&` conjunct
// turns the two denial cases red and leaves the paid-tier case green.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const presignGate = vi.fn();
vi.mock('@/sign-gate/presign', () => ({ presignGate: (...a) => presignGate(...a) }));

vi.mock('@/rasp', () => ({
  detect: vi.fn(() => ({})),
  degrade: vi.fn(() => ({ tier: 'allow' })),
  TIER: { ALLOW: 'allow', BLOCK: 'block' },
  browserProbeSource: {},
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));
vi.mock('@/risk/levels', () => ({ LEVEL: { OK: 'ok', CAUTION: 'caution' } }));

// THE SEAM UNDER TEST — capture what the intel builder is told.
const buildWcTransactionIntelligence = vi.fn(() => Promise.resolve({ txLevel: 'ok' }));
vi.mock('@/risk/walletConnectIntel.js', () => ({
  buildWcTransactionIntelligence: (...a) => buildWcTransactionIntelligence(...a),
  WC_TX_RISK_SIGNALS: [],
}));

// The tier source the fix consults. Fail-closed to 'free' in production.
const hasAdvisorOnlineAccessCached = vi.fn(() => false);
vi.mock('@/lib/tierCache.js', () => ({
  hasAdvisorOnlineAccessCached: (...a) => hasAdvisorOnlineAccessCached(...a),
  getCachedTier: () => 'free',
  setCachedTier: vi.fn(),
}));

// User has explicitly turned the preference ON, so the ONLY thing that can deny
// the remote screen in these tests is the tier gate. Without this the test could
// pass for the wrong reason.
vi.mock('@/lib/remoteScreenPreference.js', () => ({
  readRemoteScreenPreference: vi.fn(() => true),
  persistRemoteScreenPreference: vi.fn(),
}));

const respondToRequest = vi.fn(() => Promise.resolve());
const rejectRequest = vi.fn(() => Promise.resolve());
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 86_400;
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn(() => Promise.resolve()),
  onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => ({
    find: () => ({
      topic: '__live__',
      expiry: FUTURE_EXPIRY,
      namespaces: { eip155: { chains: ['eip155:1', 'eip155:11155111'] } },
    }),
  })),
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
  parseTypedData: vi.fn(() => ({ valid: true, types: {}, domain: {}, message: {} })),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve('0xaa36a7')),
    estimateGas: vi.fn(() => Promise.resolve(21_000n)),
  })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia' })),
}));

const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }],
    isUnlocked: true,
    withPrivateKey,
    isSendReauthRequired: () => false,
  }),
}));
vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor() {}
      signMessage() { return Promise.resolve('0xsig'); }
      signTypedData() { return Promise.resolve('0xsig'); }
      sendTransaction() { return Promise.resolve({ hash: '0xhash' }); }
    },
    getBytes: (x) => x,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v),
  },
}));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';

function captureHandlers() {
  const out = {};
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Grab() {
    out.sendTransaction = useWalletConnect().sendTransaction;
    return null;
  }
  render(
    <QueryClientProvider client={qc}>
      <WalletConnectProvider><Grab /></WalletConnectProvider>
    </QueryClientProvider>,
  );
  return out;
}

const TX = [{ from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', to: '0xdef', value: '0x0' }];

async function remoteScreenFlagForSend() {
  const h = captureHandlers();
  await act(async () => {
    try { await h.sendTransaction('t', 1, TX, 'eip155:11155111'); } catch { /* gate may reject */ }
  });
  const call = buildWcTransactionIntelligence.mock.calls.at(-1);
  return call?.[0]?.remoteScreenEnabled;
}

beforeEach(() => {
  vi.clearAllMocks();
  presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
  buildWcTransactionIntelligence.mockResolvedValue({ txLevel: 'ok' });
});

describe('WalletConnect send — TIP remote screen is tier-gated (audit M-2, I2)', () => {
  it('does NOT enable the remote screen for a free tier, even with the preference ON', async () => {
    hasAdvisorOnlineAccessCached.mockReturnValue(false);
    expect(await remoteScreenFlagForSend()).toBe(false);
  });

  it('DOES enable it for a tier with advisor-online access', async () => {
    hasAdvisorOnlineAccessCached.mockReturnValue(true);
    expect(await remoteScreenFlagForSend()).toBe(true);
  });

  it('consults the tier on every send, not once at mount', async () => {
    // A cached-at-mount read would keep screening on across a downgrade or a
    // deniability flip (tierCache forces 'free' on that flip).
    hasAdvisorOnlineAccessCached.mockReturnValue(true);
    expect(await remoteScreenFlagForSend()).toBe(true);

    hasAdvisorOnlineAccessCached.mockReturnValue(false);
    expect(await remoteScreenFlagForSend()).toBe(false);
  });
});
