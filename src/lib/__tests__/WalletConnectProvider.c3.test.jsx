// Behavioural regression guard for audit finding C3 (CRITICAL) in
// WalletConnectProvider.jsx.
//
// C3: handlePersonalSign / handleSignTypedData / handleSendTransaction called
// withPrivateKey() with NO RASP pre-sign gate. A dApp paired via WalletConnect
// could thus extract a signature (or broadcast a tx) in a hostile runtime that
// the in-app Send chokepoint would BLOCK. These handlers must consult the same
// presignGate() RASP plane and reject the request (fail closed, I4) when it
// does not allow proceeding.
//
// We render the real provider, mock its collaborators, pull the three handlers
// off the exposed context, and assert that when the gate BLOCKS the request is
// rejected (rejectRequest called, respondToRequest NOT), and when the gate
// ALLOWS the signer is reached (respondToRequest called).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

// --- presignGate is the single seam C3 must wire in. Each test sets its return. ---
const presignGate = vi.fn();
vi.mock('@/sign-gate/presign', () => ({ presignGate: (...a) => presignGate(...a) }));

// RASP primitives — pure, return innocuous values; the gate decision is forced
// via the presignGate mock above.
vi.mock('@/rasp', () => ({
  detect: vi.fn(() => ({})),
  degrade: vi.fn(() => ({ tier: 'allow' })),
  TIER: { ALLOW: 'allow', BLOCK: 'block' },
  browserProbeSource: {},
}));
vi.mock('@/risk/levels', () => ({ LEVEL: { OK: 'ok' } }));

// --- session.js: capture rejectRequest / respondToRequest call counts. ---
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
  parseTypedData: vi.fn(() => ({
    valid: true,
    types: { EIP712Domain: [] },
    domain: {},
    message: {},
  })),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({ send: vi.fn(() => Promise.resolve('0xaa36a7')) })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia' })),
}));

// withPrivateKey runs the signer callback with a throwaway key; we never reach
// it when the gate blocks.
const withPrivateKey = vi.fn((_i, fn) => fn('0x' + '11'.repeat(32)));
vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: () => ({
    accounts: [{ address: '0xabc' }],
    isUnlocked: true,
    withPrivateKey,
    isSendReauthRequired: () => false,
  }),
}));

// ethers Wallet must not actually sign — stub the signing surface.
vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor() {}
      signMessage() { return Promise.resolve('0xsig'); }
      signTypedData() { return Promise.resolve('0xsig'); }
      sendTransaction() { return Promise.resolve({ hash: '0xhash' }); }
    },
    getBytes: (x) => x,
  },
}));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';

function captureHandlers() {
  const out = {};
  function Grab() {
    const ctx = useWalletConnect();
    out.signPersonal = ctx.signPersonal;
    out.signTypedData = ctx.signTypedData;
    out.sendTransaction = ctx.sendTransaction;
    return null;
  }
  render(
    <WalletConnectProvider>
      <Grab />
    </WalletConnectProvider>,
  );
  return out;
}

describe('WalletConnectProvider — C3: dApp signing handlers obey the RASP pre-sign gate', () => {
  beforeEach(() => {
    respondToRequest.mockClear();
    rejectRequest.mockClear();
    withPrivateKey.mockClear();
    presignGate.mockReset();
  });

  describe('gate BLOCKS (hostile runtime) → reject, never sign', () => {
    beforeEach(() => {
      presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: false });
    });

    it('handlePersonalSign rejects and does not respond', async () => {
      const h = captureHandlers();
      await act(async () => { await h.signPersonal('topic1', 1, ['0xdeadbeef', '0xabc']); });
      expect(rejectRequest).toHaveBeenCalledWith('topic1', 1, 'RASP_BLOCK');
      expect(respondToRequest).not.toHaveBeenCalled();
      expect(withPrivateKey).not.toHaveBeenCalled();
    });

    it('handleSignTypedData rejects and does not respond', async () => {
      const h = captureHandlers();
      await act(async () => { await h.signTypedData('topic2', 2, ['0xabc', '{}']); });
      expect(rejectRequest).toHaveBeenCalledWith('topic2', 2, 'RASP_BLOCK');
      expect(respondToRequest).not.toHaveBeenCalled();
      expect(withPrivateKey).not.toHaveBeenCalled();
    });

    it('handleSendTransaction rejects and does not respond', async () => {
      const h = captureHandlers();
      await act(async () => {
        await h.sendTransaction('topic3', 3, [{ to: '0xdef', value: '0x0' }], 'eip155:11155111');
      });
      expect(rejectRequest).toHaveBeenCalledWith('topic3', 3, 'RASP_BLOCK');
      expect(respondToRequest).not.toHaveBeenCalled();
      expect(withPrivateKey).not.toHaveBeenCalled();
    });
  });

  describe('gate ALLOWS → signer reached, request answered', () => {
    beforeEach(() => {
      presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
    });

    it('handlePersonalSign responds and never rejects', async () => {
      const h = captureHandlers();
      await act(async () => { await h.signPersonal('topicA', 10, ['0xdeadbeef', '0xabc']); });
      expect(respondToRequest).toHaveBeenCalled();
      expect(rejectRequest).not.toHaveBeenCalled();
    });

    it('handleSignTypedData responds and never rejects', async () => {
      const h = captureHandlers();
      await act(async () => { await h.signTypedData('topicB', 11, ['0xabc', '{}']); });
      expect(respondToRequest).toHaveBeenCalled();
      expect(rejectRequest).not.toHaveBeenCalled();
    });

    it('handleSendTransaction responds and never rejects', async () => {
      const h = captureHandlers();
      await act(async () => {
        await h.sendTransaction('topicC', 12, [{ to: '0xdef', value: '0x0' }], 'eip155:11155111');
      });
      expect(respondToRequest).toHaveBeenCalled();
      expect(rejectRequest).not.toHaveBeenCalled();
    });
  });
});
