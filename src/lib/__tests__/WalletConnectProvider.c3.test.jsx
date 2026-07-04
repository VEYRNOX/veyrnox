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

// M9: estimateGas is a per-test seam. Default returns a small estimate; tests
// override estimateGasMock to exercise the cap.
const estimateGasMock = vi.fn(() => Promise.resolve(21_000n));
vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve('0xaa36a7')),
    estimateGas: (...a) => estimateGasMock(...a),
  })),
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
// M9: capture the tx object passed to sendTransaction so tests can assert gasLimit.
const sentTxCapture = { last: null };

// Most signing-path tests assume a live (non-expired) session for the request's
// topic. M11 added an expiry gate; this returns an array whose .find() yields a
// far-future-expiry session for ANY looked-up topic, so the allow-path tests
// (which use many different topics) behave as before without per-topic setup.
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 86_400;
function liveSessionsAnyTopic() {
  // .find() ignores the topic predicate and always yields a live session, so the
  // M11 expiry gate passes for whatever topic the handler under test looks up.
  // F-07-WC: the handler now reads the bound CAIP-2 chain from the session's
  // approved namespaces (not a prop), so the fake session must advertise the
  // chains the H7 tests bind against (eip155:1 and eip155:11155111).
  return {
    find: () => ({
      topic: '__live__',
      expiry: FUTURE_EXPIRY,
      namespaces: { eip155: { chains: ['eip155:1', 'eip155:11155111'] } },
    }),
  };
}
vi.mock('ethers', () => ({
  ethers: {
    Wallet: class {
      constructor() {}
      signMessage() { return Promise.resolve('0xsig'); }
      signTypedData() { return Promise.resolve('0xsig'); }
      sendTransaction(tx) { sentTxCapture.last = tx; return Promise.resolve({ hash: '0xhash' }); }
    },
    getBytes: (x) => x,
    // Lenient: accept the short 0x fixtures these tests use (e.g. '0xabc') so
    // the H8 [message,address] vs [address,message] binding can resolve. Real
    // ethers.isAddress enforces 40 hex chars; the binding logic is under test
    // here, not address-length validation.
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v),
  },
}));

import { WalletConnectProvider, useWalletConnect } from '@/lib/WalletConnectProvider.jsx';
import { parseTypedData } from '@/wallet-core/evm/typed-data.js';
import { getActiveSessions } from '@/wallet-core/evm/walletconnect/session.js';

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
      // M11 expiry runs BEFORE the C3 RASP gate; without a live session the
      // expiry check fires first (SESSION_EXPIRED) and we never reach the RASP
      // assertion under test. Give every topic a live session.
      getActiveSessions.mockReturnValue(liveSessionsAnyTopic());
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
      getActiveSessions.mockReturnValue(liveSessionsAnyTopic());
    });

    it('handlePersonalSign responds and never rejects', async () => {
      const h = captureHandlers();
      await act(async () => { await h.signPersonal('topicA', 10, ['0xdeadbeef', '0xabc']); });
      expect(respondToRequest).toHaveBeenCalled();
      expect(rejectRequest).not.toHaveBeenCalled();
    });

    it('handleSignTypedData responds and never rejects', async () => {
      // H7: typed data must carry a domain.chainId matching the session chain.
      parseTypedData.mockReturnValue({
        valid: true,
        types: { EIP712Domain: [] },
        domain: { chainId: 11155111 },
        message: {},
      });
      const h = captureHandlers();
      await act(async () => { await h.signTypedData('topicB', 11, ['0xabc', '{}'], 'eip155:11155111'); });
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

describe('WalletConnectProvider — H7: EIP-712 domain.chainId bound to session chain', () => {
  beforeEach(() => {
    respondToRequest.mockClear();
    rejectRequest.mockClear();
    withPrivateKey.mockClear();
    presignGate.mockReset();
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
    getActiveSessions.mockReturnValue(liveSessionsAnyTopic());
    parseTypedData.mockReturnValue({
      valid: true,
      types: { EIP712Domain: [] },
      domain: { chainId: 11155111 },
      message: {},
    });
  });

  it('rejects CHAIN_ID_MISMATCH when domain.chainId differs from session chain', async () => {
    parseTypedData.mockReturnValue({
      valid: true,
      types: { EIP712Domain: [] },
      domain: { chainId: 1 }, // mainnet permit on a Sepolia session
      message: {},
    });
    const h = captureHandlers();
    // The handler rejects the request AND throws to surface the error to the
    // modal; swallow the throw so the security assertions below still bind.
    await act(async () => {
      await h.signTypedData('topicH7a', 70, ['0xabc', '{}'], 'eip155:11155111').catch(() => {});
    });
    expect(rejectRequest).toHaveBeenCalledWith('topicH7a', 70, 'CHAIN_ID_MISMATCH');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('signs when domain.chainId matches the session chain', async () => {
    const h = captureHandlers();
    await act(async () => {
      await h.signTypedData('topicH7b', 71, ['0xabc', '{}'], 'eip155:11155111');
    });
    expect(respondToRequest).toHaveBeenCalled();
    expect(rejectRequest).not.toHaveBeenCalled();
  });

  it('rejects CHAIN_ID_MISMATCH when domain.chainId is absent (fail closed)', async () => {
    parseTypedData.mockReturnValue({
      valid: true,
      types: { EIP712Domain: [] },
      domain: {}, // no chainId — cannot be bound to this session
      message: {},
    });
    const h = captureHandlers();
    await act(async () => {
      await h.signTypedData('topicH7c', 72, ['0xabc', '{}'], 'eip155:11155111').catch(() => {});
    });
    expect(rejectRequest).toHaveBeenCalledWith('topicH7c', 72, 'CHAIN_ID_MISMATCH');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });
});

describe('WalletConnectProvider — M11: expired session rejected before signing', () => {
  // An expired session (expiry seconds < now) must never reach withPrivateKey.
  // getActiveSessions() can still return it if the SDK has not fired
  // session_expire (e.g. app was offline). Fail closed (I4): reject SESSION_EXPIRED.
  const PAST = Math.floor(Date.now() / 1000) - 60; // 60s ago, expired

  beforeEach(() => {
    respondToRequest.mockClear();
    rejectRequest.mockClear();
    withPrivateKey.mockClear();
    presignGate.mockReset();
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
    parseTypedData.mockReturnValue({
      valid: true,
      types: { EIP712Domain: [] },
      domain: { chainId: 11155111 },
      message: {},
    });
    getActiveSessions.mockReturnValue([{ topic: 'expTopic', expiry: PAST }]);
  });

  it('handlePersonalSign rejects SESSION_EXPIRED and never signs', async () => {
    const h = captureHandlers();
    await act(async () => { await h.signPersonal('expTopic', 200, ['0xdeadbeef', '0xabc']).catch(() => {}); });
    expect(rejectRequest).toHaveBeenCalledWith('expTopic', 200, 'SESSION_EXPIRED');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('handleSignTypedData rejects SESSION_EXPIRED and never signs', async () => {
    const h = captureHandlers();
    await act(async () => { await h.signTypedData('expTopic', 201, ['0xabc', '{}'], 'eip155:11155111').catch(() => {}); });
    expect(rejectRequest).toHaveBeenCalledWith('expTopic', 201, 'SESSION_EXPIRED');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('handleSendTransaction rejects SESSION_EXPIRED and never signs', async () => {
    const h = captureHandlers();
    await act(async () => {
      await h.sendTransaction('expTopic', 202, [{ to: '0xdef', value: '0x0' }], 'eip155:11155111').catch(() => {});
    });
    expect(rejectRequest).toHaveBeenCalledWith('expTopic', 202, 'SESSION_EXPIRED');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('handlePersonalSign rejects SESSION_EXPIRED when session is absent (fail closed)', async () => {
    getActiveSessions.mockReturnValue([]);
    const h = captureHandlers();
    await act(async () => { await h.signPersonal('goneTopic', 203, ['0xdeadbeef', '0xabc']).catch(() => {}); });
    expect(rejectRequest).toHaveBeenCalledWith('goneTopic', 203, 'SESSION_EXPIRED');
    expect(respondToRequest).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });
});

describe('WalletConnectProvider — M9: 1M gas cap enforced in BOTH branches', () => {
  beforeEach(() => {
    respondToRequest.mockClear();
    rejectRequest.mockClear();
    withPrivateKey.mockClear();
    estimateGasMock.mockReset();
    sentTxCapture.last = null;
    presignGate.mockReset();
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true });
    getActiveSessions.mockReturnValue(liveSessionsAnyTopic());
  });

  it('caps dApp-supplied gas above 1M to exactly 1M', async () => {
    const h = captureHandlers();
    await act(async () => {
      await h.sendTransaction(
        'topicM9a', 90,
        [{ to: '0xdef', value: '0x0', gas: '0x1312D00' }], // 20,000,000
        'eip155:11155111',
      );
    });
    expect(sentTxCapture.last.gasLimit).toBe(1_000_000n);
    expect(estimateGasMock).not.toHaveBeenCalled();
  });

  it('uses dApp-supplied gas as-is when below 1M', async () => {
    const h = captureHandlers();
    await act(async () => {
      await h.sendTransaction(
        'topicM9b', 91,
        [{ to: '0xdef', value: '0x0', gas: '0x5208' }], // 21,000
        'eip155:11155111',
      );
    });
    expect(sentTxCapture.last.gasLimit).toBe(21_000n);
    expect(estimateGasMock).not.toHaveBeenCalled();
  });

  it('estimates gas when gas is absent and caps the estimate at 1M', async () => {
    estimateGasMock.mockResolvedValue(5_000_000n); // estimate above the cap
    const h = captureHandlers();
    await act(async () => {
      await h.sendTransaction(
        'topicM9c', 92,
        [{ to: '0xdef', value: '0x0' }], // no gas
        'eip155:11155111',
      );
    });
    expect(estimateGasMock).toHaveBeenCalled();
    expect(sentTxCapture.last.gasLimit).toBe(1_000_000n);
  });

  it('estimates gas when gas is absent and uses the estimate when below 1M', async () => {
    estimateGasMock.mockResolvedValue(42_000n); // estimate below the cap
    const h = captureHandlers();
    await act(async () => {
      await h.sendTransaction(
        'topicM9d', 93,
        [{ to: '0xdef', value: '0x0' }], // no gas
        'eip155:11155111',
      );
    });
    expect(estimateGasMock).toHaveBeenCalled();
    expect(sentTxCapture.last.gasLimit).toBe(42_000n);
  });
});
