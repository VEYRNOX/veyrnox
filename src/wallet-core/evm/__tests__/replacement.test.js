import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  from: null,
  to: '0x0000000000000000000000000000000000000002',
  hash: null,
  rawOriginal: null,
  receipt: null,
  receipts: {},
  latestNonce: 7,
  pendingNonce: 8,
  baseFee: 10_000_000_000n,
  liveTip: 1_000_000_000n,
  sent: null,
  sendError: null,
  gateResult: { proceedAllowed: true },
  gateError: null,
  deny: false,
  flipOn: null,
  order: [],
}));

const provider = vi.hoisted(() => {
  const flip = (name) => { if (state.flipOn === name) state.deny = true; };
  return {
    send: vi.fn(async (method) => { flip('chainId'); return method === 'eth_chainId' ? '0xaa36a7' : null; }),
    getTransaction: vi.fn(async () => { flip('getTransaction'); return state.rawOriginal; }),
    getTransactionReceipt: vi.fn(async (hash) => state.receipts[hash] ?? state.receipt),
    getTransactionCount: vi.fn(async (_address, tag) => tag === 'latest' ? state.latestNonce : state.pendingNonce),
    getBlock: vi.fn(async () => ({ baseFeePerGas: state.baseFee })),
    getFeeData: vi.fn(async () => ({ maxPriorityFeePerGas: state.liveTip })),
    estimateGas: vi.fn(async () => 21_000n),
  };
});

vi.mock('../provider.js', () => ({
  getProvider: vi.fn(() => provider),
}));

vi.mock('../../deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => state.deny),
}));

vi.mock('../../../sign-gate/presignOrReject.js', () => ({
  presignGateOrReject: vi.fn(async () => {
    state.order.push('gate');
    if (state.flipOn === 'gate') state.deny = true;
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
      if (state.sendError) throw state.sendError;
      state.sent = tx;
      return { hash: `0x${'cd'.repeat(32)}` };
    }
  }
  return { ...actual, Wallet: MockWallet };
});

const actualEthers = await vi.importActual('ethers');
const signer = new actualEthers.Wallet(`0x${'42'.repeat(32)}`);
const ORIGINAL_FIELDS = {
  type: 2,
  chainId: 11_155_111n,
  nonce: 7,
  to: state.to,
  value: 123n,
  data: '0x1234',
  gasLimit: 50_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
  accessList: [],
};
const signedOriginal = actualEthers.Transaction.from(ORIGINAL_FIELDS);
signedOriginal.signature = signer.signingKey.sign(signedOriginal.unsignedHash);
state.from = signer.address;
state.hash = signedOriginal.hash;

const FROM = state.from;
const TO = state.to;
const HASH = state.hash;
const REPLACEMENT_HASH = `0x${'cd'.repeat(32)}`;

function rpcOriginal(overrides = {}) {
  return {
    ...ORIGINAL_FIELDS,
    hash: HASH,
    from: FROM,
    signature: signedOriginal.signature,
    blockNumber: null,
    blockHash: null,
    ...overrides,
  };
}

const {
  preparePendingEvmReplacement,
  replacePendingEvmTransaction,
  reconcileEvmReplacement,
  isReplacementPreSignRejection,
  REPLACEMENT_ACTION,
} = await import('../replacement.js');

const signWith = (sign) => sign(`0x${'11'.repeat(32)}`);
const prepare = (action = REPLACEMENT_ACTION.SPEED_UP) => preparePendingEvmReplacement({
  networkKey: 'sepolia', originalHash: HASH, expectedFrom: FROM, action,
});

beforeEach(() => {
  state.rawOriginal = rpcOriginal();
  state.receipt = null;
  state.receipts = {};
  state.latestNonce = 7;
  state.pendingNonce = 8;
  state.baseFee = 10_000_000_000n;
  state.liveTip = 1_000_000_000n;
  state.sent = null;
  state.sendError = null;
  state.gateResult = { proceedAllowed: true };
  state.gateError = null;
  state.deny = false;
  state.flipOn = null;
  state.order = [];
  vi.clearAllMocks();
});

describe('pending EVM replacement — broadcast path stubbed', () => {
  it('speed-up signs the same transaction and nonce with both fee fields raised', async () => {
    const prepared = await prepare();
    const result = await replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: async (sign) => { state.order.push('key'); return signWith(sign); },
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
    expect(result.hash).toBe(REPLACEMENT_HASH);
    expect(result.nonce).toBe(7);
  });

  it('cancel signs a zero-value self-send with the original nonce and bumped fees', async () => {
    const prepared = await prepare(REPLACEMENT_ACTION.CANCEL);
    await replacePendingEvmTransaction({
      prepared,
      isReauthRequired: () => false,
      withPrivateKey: signWith,
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
    const prepared = await prepare();
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
    const prepared = await prepare();
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
    await expect(prepare()).rejects.toMatchObject({ code: 'ORIGINAL_TX_CONFIRMED' });
    expect(state.sent).toBeNull();
  });

  it('fails closed when the latest confirmed nonce has passed the original nonce', async () => {
    state.latestNonce = 8;
    state.pendingNonce = 8;
    await expect(prepare(REPLACEMENT_ACTION.CANCEL)).rejects.toMatchObject({ code: 'ORIGINAL_NONCE_GONE' });
    expect(state.sent).toBeNull();
  });

  it('still allows a queued original behind a nonce gap (pending count below its nonce)', async () => {
    state.latestNonce = 5;
    state.pendingNonce = 5;
    const prepared = await prepare();
    expect(prepared.txRequest.nonce).toBe(7);
  });

  it('re-checks confirmation and nonce state after review, immediately before signing', async () => {
    const prepared = await prepare();
    state.receipt = { status: 1, blockNumber: 100 };

    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    })).rejects.toMatchObject({ code: 'ORIGINAL_TX_CONFIRMED' });
    expect(state.sent).toBeNull();

    state.receipt = null;
    state.latestNonce = 8;
    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    })).rejects.toMatchObject({ code: 'ORIGINAL_NONCE_GONE' });
    expect(state.sent).toBeNull();
  });

  it('refuses a reviewed speed-up if any original transaction field was changed', async () => {
    const prepared = await prepare();
    prepared.txRequest.to = FROM;

    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    })).rejects.toMatchObject({ code: 'REPLACEMENT_REVIEW_CHANGED' });
    expect(state.sent).toBeNull();
  });
});

describe('original transaction authentication (untrusted RPC)', () => {
  it.each([
    ['recipient', { to: '0x00000000000000000000000000000000000000ff' }],
    ['value', { value: 999_999n }],
    ['calldata', { data: '0xdeadbeef' }],
    ['missing signature', { signature: null }],
    ['legacy type', { type: 0 }],
  ])('rejects an RPC response with a tampered %s under the genuine hash', async (_label, tamper) => {
    state.rawOriginal = rpcOriginal(tamper);
    await expect(prepare()).rejects.toMatchObject({
      code: expect.stringMatching(/^(ORIGINAL_TX_UNVERIFIED|REPLACEMENT_EIP1559_REQUIRED)$/),
    });
    expect(state.sent).toBeNull();
  });

  it('rejects a genuine transaction signed by a different key even if `from` claims this wallet', async () => {
    const other = new actualEthers.Wallet(`0x${'43'.repeat(32)}`);
    const foreign = actualEthers.Transaction.from(ORIGINAL_FIELDS);
    foreign.signature = other.signingKey.sign(foreign.unsignedHash);
    state.rawOriginal = rpcOriginal({ hash: foreign.hash, signature: foreign.signature });
    await expect(preparePendingEvmReplacement({
      networkKey: 'sepolia', originalHash: foreign.hash, expectedFrom: FROM, action: REPLACEMENT_ACTION.SPEED_UP,
    })).rejects.toMatchObject({ code: 'ORIGINAL_TX_SENDER_MISMATCH' });
  });

  it('rejects at signing time if the RPC starts serving a tampered payload after review', async () => {
    const prepared = await prepare();
    state.rawOriginal = rpcOriginal({ to: FROM });
    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    })).rejects.toMatchObject({ code: 'ORIGINAL_TX_UNVERIFIED' });
    expect(state.sent).toBeNull();
  });
});

describe('live network fee floor', () => {
  it('raises the fee cap to the live base fee when the 10% bump would sit below it', async () => {
    state.baseFee = 50_000_000_000n;
    const prepared = await prepare();
    // 2 x 50 gwei + max(2.2 gwei bump, 1 gwei live tip)
    expect(prepared.txRequest.maxFeePerGas).toBe(102_200_000_000n);
    expect(prepared.txRequest.maxPriorityFeePerGas).toBe(2_200_000_000n);
    expect(prepared.liveBaseFeePerGas).toBe(50_000_000_000n);
    expect(prepared.maxNetworkFeeWei).toBe(50_000n * 102_200_000_000n);

    // The reviewed request is signed unchanged even if the live fee moves.
    state.baseFee = 80_000_000_000n;
    await replacePendingEvmTransaction({ prepared, isReauthRequired: () => false, withPrivateKey: signWith });
    expect(state.sent.maxFeePerGas).toBe(102_200_000_000n);
  });

  it('fails closed on an implausible live base fee from a hostile RPC', async () => {
    state.baseFee = 10_000n * 1_000_000_000n; // sepolia ceiling is 5000 gwei
    await expect(prepare()).rejects.toMatchObject({ code: 'REPLACEMENT_LIVE_FEE_UNSAFE' });
  });

  it('refuses a reviewed request whose fee was lowered below the 10% bump', async () => {
    const prepared = await prepare();
    prepared.txRequest.maxPriorityFeePerGas = 2_000_000_000n;
    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    })).rejects.toMatchObject({ code: 'REPLACEMENT_REVIEW_CHANGED' });
    expect(state.sent).toBeNull();
  });
});

describe('deniability / demo session (I3)', () => {
  it('refuses both entry points with zero RPC calls in a deniability session', async () => {
    state.deny = true;
    await expect(prepare()).rejects.toMatchObject({ code: 'REPLACEMENT_UNAVAILABLE' });
    state.deny = false;
    const prepared = await prepare();
    vi.clearAllMocks();
    state.deny = true;
    const withPrivateKey = vi.fn();
    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey,
    })).rejects.toMatchObject({ code: 'REPLACEMENT_UNAVAILABLE' });
    expect(provider.send).not.toHaveBeenCalled();
    expect(provider.getTransaction).not.toHaveBeenCalled();
    expect(withPrivateKey).not.toHaveBeenCalled();
  });

  it('stops before any RPC read or key access when the session flips during the pre-sign gate', async () => {
    const prepared = await prepare();
    vi.clearAllMocks();
    state.flipOn = 'gate';
    const withPrivateKey = vi.fn();
    await expect(replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey,
    })).rejects.toMatchObject({ code: 'REPLACEMENT_UNAVAILABLE' });
    expect(withPrivateKey).not.toHaveBeenCalled();
    expect(provider.getTransaction).not.toHaveBeenCalled();
    expect(state.sent).toBeNull();
  });

  it('stops preparing when the session flips mid-read', async () => {
    state.flipOn = 'getTransaction';
    await expect(prepare()).rejects.toMatchObject({ code: 'REPLACEMENT_UNAVAILABLE' });
    expect(provider.getTransactionReceipt).not.toHaveBeenCalled();
    expect(provider.getTransactionCount).not.toHaveBeenCalled();
  });
});

describe('failure classification', () => {
  it('marks a broadcast error as uncertain, never as a pre-sign rejection', async () => {
    const prepared = await prepare();
    state.sendError = Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
    const err = await replacePendingEvmTransaction({
      prepared, isReauthRequired: () => false, withPrivateKey: signWith,
    }).catch((e) => e);
    expect(err.code).toBe('REPLACEMENT_BROADCAST_UNCERTAIN');
    expect(isReplacementPreSignRejection(err)).toBe(false);
  });

  it('treats unknown and key-access errors as uncertain', () => {
    expect(isReplacementPreSignRejection({ code: 'WALLET_LOCKED_MID_OPERATION' })).toBe(false);
    expect(isReplacementPreSignRejection(new Error('x'))).toBe(false);
    expect(isReplacementPreSignRejection({ code: 'PRESIGN_BLOCKED' })).toBe(true);
  });
});

describe('reconcileEvmReplacement', () => {
  const base = () => ({
    networkKey: 'sepolia',
    originalHash: HASH,
    replacementHash: REPLACEMENT_HASH,
    from: FROM,
    nonce: 7,
    intervalMs: 0,
    maxAttempts: 5,
    sleep: async () => {},
  });

  it('reports the replacement as the winner only when it has a receipt', async () => {
    state.receipts[REPLACEMENT_HASH] = { status: 1 };
    await expect(reconcileEvmReplacement(base())).resolves.toEqual({ outcome: 'replacement_won', status: 'confirmed' });
  });

  it('reports the original as the winner when the original confirms first', async () => {
    state.receipts[HASH] = { status: 1 };
    await expect(reconcileEvmReplacement(base())).resolves.toEqual({ outcome: 'original_won', status: 'confirmed' });
  });

  it('needs the consumed nonce on two polls before declaring a third transaction the winner', async () => {
    state.latestNonce = 8;
    await expect(reconcileEvmReplacement(base())).resolves.toEqual({ outcome: 'other_won' });
    expect(provider.getTransactionCount).toHaveBeenCalledTimes(2);
  });

  it('stays unknown while both remain pending, and aborts with no RPC call in a deniability session', async () => {
    await expect(reconcileEvmReplacement(base())).resolves.toEqual({ outcome: 'unknown' });
    vi.clearAllMocks();
    state.deny = true;
    await expect(reconcileEvmReplacement(base())).resolves.toEqual({ outcome: 'aborted' });
    expect(provider.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
