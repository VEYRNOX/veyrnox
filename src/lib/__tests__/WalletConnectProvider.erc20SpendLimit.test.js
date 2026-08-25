// src/lib/__tests__/WalletConnectProvider.erc20SpendLimit.test.js
//
// TDD pin for weekly-audit M-6 (2026-08-25, carried from M-5 on 2026-08-17):
// the WC spend-limit gate scored ONLY the native `value` field, so
// `transfer(attacker, 1_000_000e6)` — which carries value 0x0 and puts the
// amount inside calldata — scored $0 against an `ALL` cap and sailed through.
// Nothing downstream compensated: the WC risk registry is S2 (unlimited
// approval) + S4 (poisoning) only, so no signal values a plain token transfer.
//
// Codes contracted:
//   WC_SEND_LIMIT_EXCEEDED  — the valued transfer breaches a configured cap
//   WC_SEND_UNVALUED_TOKEN  — the transfer cannot be valued at all AND a cap is
//                             configured; treated as over-limit, never as $0 (I4)
//
// The pure helper `resolveWcSpendAmount` is the contract the handler delegates
// to, so the valuation rules are pinned without going through the signer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/sign-gate/presign', () => ({
  presignGate: vi.fn(() => ({ proceedAllowed: true, signerReachable: true, decision: 'allow', owner: null })),
}));

vi.mock('@/rasp', () => ({
  TIER: { ALLOW: 'allow', WARN: 'warn', BLOCK: 'block' },
  detect: vi.fn(() => ({ condition: 'CLEAN' })),
  degrade: vi.fn((r) => ({ tier: 'allow', sentence: null, ...(r ?? {}) })),
  browserProbeSource: {},
  nativeProbeSource: vi.fn(),
  selectPresignProbeSource: vi.fn(() => ({})),
  attestationProbeSource: vi.fn(),
  detectAttestation: vi.fn(() => ({})),
  composeConditions: vi.fn((a) => a),
  ATTESTATION_ENABLED: false,
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));

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
  classifyRequest: vi.fn(() => 'SEND_TRANSACTION'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: { PERSONAL_SIGN: 'PERSONAL_SIGN', SIGN_TYPED_DATA: 'SIGN_TYPED_DATA', SEND_TRANSACTION: 'SEND_TRANSACTION' },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(),
  detectAssetAuthorising: vi.fn(),
  describeTypedData: vi.fn(),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn(async () => '0xaa36a7'),
    estimateGas: vi.fn(async () => 21_000n),
    getCode: vi.fn(async () => '0x'),
  })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111, symbol: 'ETH' })),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({ useWallet: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fakeWalletInstance = {
  signMessage: vi.fn(async () => '0xsig'),
  signTypedData: vi.fn(async () => '0xsig'),
  sendTransaction: vi.fn(async () => ({ hash: '0xtxhash' })),
};
function FakeWallet() { return fakeWalletInstance; }
FakeWallet.prototype = fakeWalletInstance;

// NOTE: no `Interface` on this mock — deliberate. It is why the ERC-20 decode
// added for M-6 must NOT route through calldata.js (which builds an ethers
// Interface at module init), and why it hand-decodes the two fixed-width
// selectors instead.
vi.mock('ethers', () => ({
  ethers: {
    Wallet: FakeWallet,
    getBytes: (v) => v,
    isAddress: (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
    getAddress: (v) => v,
  },
}));

import { rejectRequest, respondToRequest } from '@/wallet-core/evm/walletconnect/session.js';
import { TOKENS } from '@/wallet-core/evm/tokens.js';

const WALLET_ADDR = '0xAbCd1234567890AbCd1234567890abCd12345678';
const RECIPIENT   = '0x1111222233334444555566667777888899990000';
const UNKNOWN_TOKEN = '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF';
const SEPOLIA_USDC = TOKENS.sepolia.USDC.address;
const NET = { key: 'sepolia', chainId: 11155111, symbol: 'ETH' };

const word = (v) => v.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const transferData = (to, raw) => `0xa9059cbb${word(to)}${word(raw.toString(16))}`;
const transferFromData = (from, to, raw) =>
  `0x23b872dd${word(from)}${word(to)}${word(raw.toString(16))}`;

// 1,000,000 USDC — six decimals, so 1e12 base units.
const MILLION_USDC = 1_000_000n * 10n ** 6n;

function makeWithPrivateKey(spy) {
  return vi.fn(async (_i, cb) => { spy(); return cb('0xpk'); });
}

describe('M-6 — resolveWcSpendAmount values ERC-20 calldata, never silently $0', () => {
  it('values a native send from txParams.value', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    const oneEth = '0x' + (10n ** 18n).toString(16);
    expect(resolveWcSpendAmount({ value: oneEth, data: '0x' }, NET))
      .toEqual({ valued: true, amount: 1, currency: 'ETH' });
  });

  it('values a transfer() of a registry token at its real decimals', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    expect(resolveWcSpendAmount(
      { to: SEPOLIA_USDC, value: '0x0', data: transferData(RECIPIENT, MILLION_USDC) },
      NET,
    )).toEqual({ valued: true, amount: 1_000_000, currency: 'USDC' });
  });

  it('values a transferFrom() of a registry token', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    expect(resolveWcSpendAmount(
      { to: SEPOLIA_USDC, value: '0x0', data: transferFromData(WALLET_ADDR, RECIPIENT, MILLION_USDC) },
      NET,
    )).toEqual({ valued: true, amount: 1_000_000, currency: 'USDC' });
  });

  it('refuses to value a transfer of a token outside the verified registry (I4)', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    expect(resolveWcSpendAmount(
      { to: UNKNOWN_TOKEN, value: '0x0', data: transferData(RECIPIENT, MILLION_USDC) },
      NET,
    )).toEqual({ valued: false, reason: 'ERC20_TOKEN_UNKNOWN' });
  });

  it('refuses to value truncated transfer calldata (I4)', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    expect(resolveWcSpendAmount(
      { to: SEPOLIA_USDC, value: '0x0', data: '0xa9059cbb' + word(RECIPIENT) },
      NET,
    )).toEqual({ valued: false, reason: 'ERC20_CALLDATA_MALFORMED' });
  });

  it('falls back to the native value for calldata that is not an ERC-20 transfer', async () => {
    const { resolveWcSpendAmount } = await import('../WalletConnectProvider.jsx');
    const oneEth = '0x' + (10n ** 18n).toString(16);
    expect(resolveWcSpendAmount({ to: UNKNOWN_TOKEN, value: oneEth, data: '0xdeadbeef' }, NET))
      .toEqual({ valued: true, amount: 1, currency: 'ETH' });
  });
});

describe('M-6 — the WC send handler scores ERC-20 transfers against spend limits', () => {
  let withPrivateKeySpy;
  let withPrivateKey;

  beforeEach(() => {
    vi.clearAllMocks();
    withPrivateKeySpy = vi.fn();
    withPrivateKey = makeWithPrivateKey(withPrivateKeySpy);
  });

  const base = { from: WALLET_ADDR, value: '0x0' };
  const ctx = (over) => ({
    withPrivateKey,
    evmAddress: WALLET_ADDR,
    actionPasswordConfigured: false,
    history: [],
    usdRates: { ETH: 2000, USDC: 1 },
    ...over,
  });

  it('rejects WC_SEND_LIMIT_EXCEEDED for a 1,000,000 USDC transfer against a $100 ALL cap', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      ctx({ txLimits: [{ enabled: true, currency: 'ALL', per_transaction_limit: 100 }] }),
      'topic', 60,
      [{ ...base, to: SEPOLIA_USDC, data: transferData(RECIPIENT, MILLION_USDC) }],
      'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 60, 'WC_SEND_LIMIT_EXCEEDED');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('rejects WC_SEND_UNVALUED_TOKEN for an unvaluable transfer while a cap is configured (I4)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      ctx({ txLimits: [{ enabled: true, currency: 'ALL', per_transaction_limit: 100 }] }),
      'topic', 61,
      [{ ...base, to: UNKNOWN_TOKEN, data: transferData(RECIPIENT, MILLION_USDC) }],
      'eip155:11155111',
    ).catch(() => {});
    expect(rejectRequest).toHaveBeenCalledWith('topic', 61, 'WC_SEND_UNVALUED_TOKEN');
    expect(withPrivateKeySpy).not.toHaveBeenCalled();
  });

  it('allows an unvaluable transfer when NO cap is configured (no false block)', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      ctx({ txLimits: [] }),
      'topic', 62,
      [{ ...base, to: UNKNOWN_TOKEN, data: transferData(RECIPIENT, MILLION_USDC) }],
      'eip155:11155111',
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
  });

  it('allows a registry-token transfer that sits under the cap', async () => {
    const { _handleSendTransaction } = await import('../WalletConnectProvider.jsx');
    await _handleSendTransaction(
      ctx({ txLimits: [{ enabled: true, currency: 'ALL', per_transaction_limit: 1000 }] }),
      'topic', 63,
      [{ ...base, to: SEPOLIA_USDC, data: transferData(RECIPIENT, 5n * 10n ** 6n) }],
      'eip155:11155111',
    );
    expect(withPrivateKeySpy).toHaveBeenCalled();
    expect(respondToRequest).toHaveBeenCalled();
  });
});
