import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  from: '0x0000000000000000000000000000000000000001',
  to: '0x0000000000000000000000000000000000000002',
  hash: `0x${'ab'.repeat(32)}`,
  receipt: null,
  latestNonce: 7,
  pendingNonce: 8,
  sent: null,
  gateResult: { proceedAllowed: true },
  gateError: null,
  order: [],
}));

const FROM = state.from;
const TO = state.to;
const HASH = state.hash;

const provider = vi.hoisted(() => ({
  send: vi.fn(async (method) => method === 'eth_chainId' ? '0xaa36a7' : null),
  getTransaction: vi.fn(async () => ({
    hash: state.hash,
    from: state.from,
    to: state.to,
    nonce: 7,
    value: 123n,
    data: '0x1234',
    gasLimit: 50_000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
    chainId: 11_155_111n,
    accessList: null,
    blockNumber: null,
    blockHash: null,
  })),
  getTransactionReceipt: vi.fn(async () => state.receipt),
  getTransactionCount: vi.fn(async (_address, tag) => tag === 'latest' ? state.latestNonce : state.pendingNonce),
  estimateGas: vi.fn(async () => 21_000n),
}));

vi.mock('../provider.js', () => ({
  getProvider: vi.fn(() => provider),
}));

vi.mock('../../../sign-gate/presignOrReject.js', () => ({
  presignGateOrReject: vi.fn(async () => {
    state.order.push('gate');
    if (state.gateError) throw state.gateError;
    return state.gateResult;
  }),
}));

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  class MockWallet {
    constructor() {
      this.address = state.from;
    }
    async sendTransaction(tx) {
      state.sent = tx;
      return { hash: `0x${'cd'.repeat(32)}`, wait: vi.fn(async () => ({ status: 1 })) };
    }
  }
  return { ...actual, Wallet: MockWallet };
});

const {
  preparePendingEvmReplacement,
  replacePendingEvmTransaction,
  REPLACEMENT_ACTION,
} = await import('../replacement.js');

beforeEach(() => {
  state.receipt = null;
  state.latestNonce = 7;
  state.pendingNonce = 8;
  state.sent = null;
  state.gateResult = { proceedAllowed: true };
  state.gateError = null;
  state.order = [];
  vi.clearAllMocks();
});

describe('pending EVM replacement — broadcast path stubbed', () => {
  it('speed-up signs the same transaction and nonce with both fee fields raised', async () => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia',
      originalHash: HASH,
      expectedFrom: FROM,
      action: REPLACEMENT_ACTION.SPEED_UP,
    });
    const result = await replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: async (sign) => { state.order.push('key'); return sign(`0x${'11'.repeat(32)}`); },
    });

    expect(state.order).toEqual(['gate', 'key']);
    expect(state.sent).toMatchObject({
      to: TO,
      value: 123n,
      data: '0x1234',
      nonce: 7,
      gasLimit: 50_000n,
      maxFeePerGas: 33_000_000_000n,
      maxPriorityFeePerGas: 2_200_000_000n,
    });
    expect(result.hash).toBe(`0x${'cd'.repeat(32)}`);
  });

  it('cancel signs a zero-value self-send with the original nonce and bumped fees', async () => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia',
      originalHash: HASH,
      expectedFrom: FROM,
      action: REPLACEMENT_ACTION.CANCEL,
    });
    await replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: (sign) => sign(`0x${'11'.repeat(32)}`),
    });

    expect(state.sent).toMatchObject({
      to: FROM,
      value: 0n,
      data: '0x',
      nonce: 7,
      gasLimit: 25_200n,
      maxFeePerGas: 33_000_000_000n,
      maxPriorityFeePerGas: 2_200_000_000n,
    });
  });

  it.each([
    ['missing', undefined, null],
    ['malformed', {}, null],
    ['errored', null, new Error('probe failed')],
  ])('blocks a %s pre-sign result before the key or broadcaster is reached', async (_label, gateResult, gateError) => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    });
    state.gateResult = gateResult;
    state.gateError = gateError;
    const withPrivateKey = vi.fn();
    await expect(replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey,
    })).rejects.toMatchObject({ code: 'PRESIGN_BLOCKED' });
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(state.sent).toBeNull();
  });

  it('blocks stale or errored step-up state before the pre-sign gate', async () => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    });
    const withPrivateKey = vi.fn();
    await expect(replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => { throw new Error('missing auth state'); },
      withPrivateKey,
    })).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(state.order).toEqual([]);
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('fails closed when the original transaction has confirmed', async () => {
    state.receipt = { status: 1, blockNumber: 99 };
    await expect(preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    })).rejects.toMatchObject({ code: 'ORIGINAL_TX_CONFIRMED' });
    expect(state.sent).toBeNull();
  });

  it('fails closed when latest/pending nonce state says the original nonce is gone', async () => {
    state.latestNonce = 8;
    state.pendingNonce = 8;
    await expect(preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.CANCEL,
    })).rejects.toMatchObject({ code: 'ORIGINAL_NONCE_GONE' });
    expect(state.sent).toBeNull();
  });

  it('re-checks confirmation and nonce state after review, immediately before signing', async () => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    });
    state.receipt = { status: 1, blockNumber: 100 };

    await expect(replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: (sign) => sign(`0x${'11'.repeat(32)}`),
    })).rejects.toMatchObject({ code: 'ORIGINAL_TX_CONFIRMED' });
    expect(state.sent).toBeNull();

    state.receipt = null;
    state.latestNonce = 8;
    await expect(replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: (sign) => sign(`0x${'11'.repeat(32)}`),
    })).rejects.toMatchObject({ code: 'ORIGINAL_NONCE_GONE' });
    expect(state.sent).toBeNull();
  });

  it('refuses a reviewed speed-up if any original transaction field was changed', async () => {
    const prepared = await preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    });
    prepared.txRequest.to = FROM;

    await expect(replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: (sign) => sign(`0x${'11'.repeat(32)}`),
    })).rejects.toMatchObject({ code: 'REPLACEMENT_REVIEW_CHANGED' });
    expect(state.sent).toBeNull();
  });
});
