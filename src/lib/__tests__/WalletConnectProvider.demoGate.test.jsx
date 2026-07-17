// Behavioural regression guard: the WalletConnect provider must NEVER initialise
// (and must tear down) when DEMO mode is active.
//
// THE ASYMMETRY. Demo mode (`DEMO` from '@/api/demoClient') can be flipped on by a
// stale persisted `veyrnox-demo=1` in localStorage (the known trap in CLAUDE.md —
// it persists silently across reloads). SendCrypto simulates sends in demo, and
// wallet-core egress gates (deniabilitySession.js — the Trezor precedent) block
// on the demo flag. But the WalletConnect init/teardown effects gated only on
// `!isUnlocked || isDecoy || isHidden || !isWalletConnectConfigured()` — never on
// demo. So a REAL unlocked, non-decoy vault carrying a stale demo flag would open
// a live WC relay WebSocket and perform fully REAL dApp pairing / signing /
// broadcast while the rest of the app presents fake demo data. That is live relay
// egress + real key use behind a demo facade.
//
// FAIL CLOSED (I4). When DEMO is true the WC client must never be created (no
// initWalletConnect, no relay socket), even with isUnlocked true; and if a client
// somehow exists, the teardown effect must destroy it exactly as it does for a
// deniability transition.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// --- DEMO is the seam under test. Forced true for this whole suite. ---
vi.mock('@/api/demoClient', () => ({ DEMO: true }));

// Collaborators mocked to the same shapes the other WC provider tests use.
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

// session.js: the control under test is `initWalletConnect` — assert it is NEVER
// called in demo. destroyWalletConnect is captured for the teardown assertion.
const initWalletConnect = vi.fn(() => Promise.resolve());
const destroyWalletConnect = vi.fn();
vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: (...a) => initWalletConnect(...a),
  onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: (...a) => destroyWalletConnect(...a),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: vi.fn(),
  rejectSession: vi.fn(),
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
  parseTypedData: vi.fn(() => ({ valid: true, types: { EIP712Domain: [] }, domain: {}, message: {} })),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(), estimateGas: vi.fn() })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia' })),
}));

// A REAL unlocked, non-decoy, non-hidden wallet. This is the dangerous case:
// everything the existing gates check says "go", only the demo flag says "stop".
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
  function Grab() {
    out.ctx = useWalletConnect();
    return null;
  }
  render(
    <WalletConnectProvider>
      <Grab />
    </WalletConnectProvider>,
  );
  return out;
}

describe('WalletConnectProvider — demo gate: no relay egress while demo is active', () => {
  beforeEach(() => {
    initWalletConnect.mockClear();
    destroyWalletConnect.mockClear();
  });

  it('never calls initWalletConnect when DEMO is true, even with an unlocked non-decoy wallet', () => {
    renderWithCapture();
    // I2/I3: the relay WebSocket must not open. initWalletConnect() is the sole
    // entry that opens it, so it must never fire in demo.
    expect(initWalletConnect).not.toHaveBeenCalled();
  });

  it('reports initialized=false in demo (client was never created)', () => {
    const out = renderWithCapture();
    expect(out.ctx.initialized).toBe(false);
  });

  it('tears down (destroyWalletConnect) in demo, mirroring a deniability transition', () => {
    renderWithCapture();
    // The teardown effect treats demo like isDecoy/isHidden: if a client somehow
    // survives into a demo session it must be destroyed (fail closed, I4).
    expect(destroyWalletConnect).toHaveBeenCalled();
  });
});
