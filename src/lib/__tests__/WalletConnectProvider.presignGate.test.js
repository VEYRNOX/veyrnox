// src/lib/__tests__/WalletConnectProvider.presignGate.test.js
//
// TDD pin for audit finding C3: every WalletConnect signing handler must call
// presignGate before reaching withPrivateKey. A RASP_BLOCK must reject the
// WC request and must NOT reach the private-key accessor.
//
// Red → green discipline: these tests fail until the implementation step wires
// presignGate into handlePersonalSign, handleSignTypedData, handleSendTransaction.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- module mocks (hoisted so imports in the SUT resolve to our fakes) ------

// presignGate mock — controlled per-test via mockReturnValue
vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(() => ({ proceedAllowed: true, signerReachable: true, decision: 'allow', owner: null })),
}));

// RASP mock — default: clean environment → ALLOW tier
vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn', BLOCK: 'block' },
  detect: vi.fn(() => ({ condition: 'CLEAN' })),
  degrade: vi.fn((r) => ({ tier: 'allow', sentence: null, ...(r ?? {}) })),
  browserProbeSource: {},
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));

// WalletConnect session helpers — minimal stubs; tests exercise handler logic only
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
  classifyRequest: vi.fn(() => 'PERSONAL_SIGN'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { PERSONAL_SIGN: 'PERSONAL_SIGN', SIGN_TYPED_DATA: 'SIGN_TYPED_DATA', SEND_TRANSACTION: 'SEND_TRANSACTION' },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(() => ({
    valid: true,
    types: { EIP712Domain: [], Mail: [] },
    domain: { name: 'Test' },
    message: { from: '0x0' },
    error: null,
  })),
  detectAssetAuthorising: vi.fn(() => null),
  describeTypedData: vi.fn(() => null),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(async () => '0xaa36a7'), // eth_chainId = Sepolia
    estimateGas: vi.fn(async () => 21_000n), // M9: gas estimate when dApp omits `gas`
  })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111 })),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: vi.fn(),
}));

// sonner toast — swallow
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ethers — only needs Wallet.signMessage / signTypedData / sendTransaction
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
    // H8: isAddress used to detect reversed-order personal_sign params
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
  },
}));

// ---- helpers ----------------------------------------------------------------

import { presignGate } from '@/sign-gate/presign';
import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';
import { useWallet } from '@/lib/WalletProvider.jsx';

/**
 * Build a fake withPrivateKey: calls the callback with a fake pk if invoked,
 * and also lets us verify whether it was called.
 */
function makeWithPrivateKey(spy) {
  return vi.fn(async (_idx, cb) => {
    spy(); // record the call
    return cb('0xfakePrivateKey');
  });
}

/**
 * Extract the handler functions directly from the provider module.
 * WalletConnectProvider is a React context provider — we can't easily render it
 * in a plain unit test. Instead, we import the handler logic by re-exporting it,
 * OR we test through a thin extraction. Since the handlers are useCallback
 * closures inside the component, the cleanest approach is to extract the pure
 * handler logic into testable helper functions at the module level.
 *
 * If the implementation extracts helpers, import and test them directly.
 * If the implementation keeps them as inline callbacks, we test via the
 * exported handler factories or via a minimal React context render (below).
 */

// We import the module purely to ensure the mock wiring is correct; the actual
// handler logic tests below use extracted pure helpers (which the implementation
// must expose) OR render the provider.

// For now, test via the pure-helper extraction that the implementation should
// add (e.g., `export function _handlePersonalSign(deps, topic, id, params)`).
// If the implementation adds named exports, import them here.

// --- The tests ---------------------------------------------------------------
// These tests are written against the EXPECTED post-implementation API:
// three exported helpers that encapsulate the presignGate check.
// Before implementation they will FAIL with "is not a function" or equivalent.

describe('C3 — presignGate in WalletConnect signing handlers', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);

    // Default: gate allows
    presignGate.mockReturnValue({ proceedAllowed: true, signerReachable: true, decision: 'allow', owner: null });

    useWallet.mockReturnValue({
      accounts: [{ address: '0xabc' }],
      isUnlocked: true,
      withPrivateKey,
      isSendReauthRequired: vi.fn(() => false),
    });
  });

  // ---- handlePersonalSign ---------------------------------------------------

  describe('handlePersonalSign', () => {
    // H8 — personal_sign param order normalization and address validation.
    // H-1 (#745): a valid evmAddress is now REQUIRED for the signer to be reached;
    // a null evmAddress fails closed, so the gate-allow test must supply one.
    const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
    const OTHER_ADDR  = '0x1111222233334444555566667777888899990000';

    it('A — calls presignGate before withPrivateKey when gate allows', async () => {
      const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
      await _handlePersonalSign(
        { withPrivateKey, evmAddress: WALLET_ADDR },
        'topic1', 1,
        ['0xdeadbeef', WALLET_ADDR],
      );
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('B — calls rejectRequest with RASP_BLOCK and does NOT call withPrivateKey when gate blocks', async () => {
      presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: false, decision: 'block', owner: 'rasp' });
      const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
      await _handlePersonalSign(
        { withPrivateKey, evmAddress: WALLET_ADDR },
        'topic1', 1,
        ['0xdeadbeef', WALLET_ADDR],
      );
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
      expect(rejectRequest).toHaveBeenCalledWith('topic1', 1, 'RASP_BLOCK');
    });

    it('C — standard order [message, address]: uses params[0] as message (H8)', async () => {
      const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
      await _handlePersonalSign(
        { withPrivateKey, evmAddress: WALLET_ADDR },
        'topic1', 1,
        ['0xdeadbeef', WALLET_ADDR],
      );
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('D — legacy reversed order [address, message]: swaps and uses params[1] as message (H8)', async () => {
      const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
      // params[0] is the wallet address (legacy MetaMask), params[1] is the message
      await _handlePersonalSign(
        { withPrivateKey, evmAddress: WALLET_ADDR },
        'topic1', 1,
        [WALLET_ADDR, '0xdeadbeef'],
      );
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('E — rejects when params[1] is a different address (H8)', async () => {
      const { _handlePersonalSign } = await import('../WalletConnectProvider.jsx');
      await expect(
        _handlePersonalSign(
          { withPrivateKey, evmAddress: WALLET_ADDR },
          'topic1', 1,
          ['0xdeadbeef', OTHER_ADDR],
        )
      ).rejects.toThrow(/address mismatch/);
      expect(rejectRequest).toHaveBeenCalledWith('topic1', 1, 'PERSONAL_SIGN_ADDRESS_MISMATCH');
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
    });
  });

  // ---- handleSignTypedData --------------------------------------------------

  describe('handleSignTypedData', () => {
    const typedDataJson = JSON.stringify({
      types: { EIP712Domain: [], Mail: [{ name: 'from', type: 'address' }] },
      domain: { name: 'Test' },
      message: { from: '0x0' },
      primaryType: 'Mail',
    });

    it('A — calls presignGate before withPrivateKey when gate allows', async () => {
      // H7 (fail closed): the typed data must carry a domain.chainId matching the
      // session chain for the handler to reach the signer.
      const { parseTypedData } = await import('@/wallet-core/evm/typed-data.js');
      vi.mocked(parseTypedData).mockReturnValueOnce({
        valid: true,
        types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Mail: [] },
        domain: { chainId: 11155111 },
        message: { from: '0x0' },
        error: null,
      });
      const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
      await _handleSignTypedData({ withPrivateKey, evmAddress: '0xabc' }, 'topic2', 2, ['0xabc', typedDataJson], 'eip155:11155111');
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('B — calls rejectRequest with RASP_BLOCK and does NOT call withPrivateKey when gate blocks', async () => {
      presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: false, decision: 'block', owner: 'rasp' });
      const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
      await _handleSignTypedData({ withPrivateKey, evmAddress: '0xabc' }, 'topic2', 2, ['0xabc', typedDataJson]);
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
      expect(rejectRequest).toHaveBeenCalledWith('topic2', 2, 'RASP_BLOCK');
    });

    // H7 — EIP-712 domain.chainId cross-chain replay protection
    it('C — rejects when domain.chainId does not match the WC session chainId (H7)', async () => {
      const { parseTypedData } = await import('@/wallet-core/evm/typed-data.js');
      vi.mocked(parseTypedData).mockReturnValueOnce({
        valid: true,
        types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Mail: [] },
        domain: { chainId: 1 }, // mainnet domain inside a Sepolia session
        message: { from: '0x0' },
        error: null,
      });
      const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
      await expect(
        _handleSignTypedData({ withPrivateKey, evmAddress: '0xabc' }, 'topic2', 2, ['0xabc', 'irrelevant'], 'eip155:11155111')
      ).rejects.toThrow(/domain.chainId.*does not match/);
      expect(rejectRequest).toHaveBeenCalledWith('topic2', 2, 'CHAIN_ID_MISMATCH');
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
    });

    it('D — allows when domain.chainId matches the WC session chainId (H7)', async () => {
      const { parseTypedData } = await import('@/wallet-core/evm/typed-data.js');
      vi.mocked(parseTypedData).mockReturnValueOnce({
        valid: true,
        types: { EIP712Domain: [{ name: 'chainId', type: 'uint256' }], Mail: [] },
        domain: { chainId: 11155111 },
        message: { from: '0x0' },
        error: null,
      });
      const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
      await _handleSignTypedData({ withPrivateKey, evmAddress: '0xabc' }, 'topic2', 2, ['0xabc', 'irrelevant'], 'eip155:11155111');
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('E — rejects CHAIN_ID_MISMATCH when domain has no chainId field (H7 — fail closed)', async () => {
      // default mock returns domain: { name: 'Test' } (no chainId). An unbound
      // signature could be replayed on another chain, so when the session chain is
      // known we fail closed (I4) rather than signing. This supersedes the earlier
      // "backwards compatible / skip the check" behaviour.
      const { _handleSignTypedData } = await import('../WalletConnectProvider.jsx');
      await expect(
        _handleSignTypedData({ withPrivateKey, evmAddress: '0xabc' }, 'topic2', 2, ['0xabc', typedDataJson], 'eip155:11155111')
      ).rejects.toThrow(/CHAIN_ID_MISMATCH/);
      expect(rejectRequest).toHaveBeenCalledWith('topic2', 2, 'CHAIN_ID_MISMATCH');
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
    });
  });

  // ---- handleSendTransaction ------------------------------------------------

  describe('handleSendTransaction', () => {
    // #1091: eth_sendTransaction now requires `from` to match evmAddress
    // (default useWallet mock returns 0xabc). Fail closed (I4) if absent/mismatch.
    const WALLET_ADDR = '0xabc0000000000000000000000000000000000000';
    const txParams = [{ from: WALLET_ADDR, to: '0xrecipient', value: '0x0', data: '0x' }];

    it('A — calls presignGate before withPrivateKey when gate allows', async () => {
      const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
      await _handleSendTransaction({ withPrivateKey, evmAddress: WALLET_ADDR }, 'topic3', 3, txParams, 'eip155:11155111');
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).toHaveBeenCalled();
      expect(respondToRequest).toHaveBeenCalled();
    });

    it('B — calls rejectRequest with RASP_BLOCK and does NOT call withPrivateKey when gate blocks', async () => {
      presignGate.mockReturnValue({ proceedAllowed: false, signerReachable: false, decision: 'block', owner: 'rasp' });
      const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
      await _handleSendTransaction({ withPrivateKey, evmAddress: WALLET_ADDR }, 'topic3', 3, txParams, 'eip155:11155111');
      expect(presignGate).toHaveBeenCalled();
      expect(withPrivateKeySpy).not.toHaveBeenCalled();
      expect(rejectRequest).toHaveBeenCalledWith('topic3', 3, 'RASP_BLOCK');
    });
  });
});
