// L-5 — rejectRequest must honour the caller-supplied reason instead of
// silently discarding it and always sending USER_REJECTED. This pins the
// mapping: known WC SDK keys → getSdkError envelope; unknown/Veyrnox-internal
// codes → {code: 4001, message: <reason>}; missing reason → USER_REJECTED.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const respondMock = vi.fn().mockResolvedValue(undefined);
const emitMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@walletconnect/core', () => ({ Core: class {} }));
vi.mock('@reown/walletkit', () => ({
  WalletKit: {
    init: vi.fn().mockResolvedValue({
      respondSessionRequest: respondMock,
      on: vi.fn(),
    }),
  },
}));
vi.mock('@walletconnect/utils', () => ({
  // getSdkError returns a canonical envelope for known keys; throws otherwise.
  // This mirrors the real behaviour closely enough to exercise the fallback.
  getSdkError: vi.fn((key) => {
    const table = {
      USER_REJECTED: { code: 5000, message: 'User rejected.' },
      UNSUPPORTED_METHODS: { code: 5101, message: 'Unsupported methods.' },
      USER_DISCONNECTED: { code: 6000, message: 'User disconnected.' },
      SESSION_SETTLEMENT_FAILED: { code: 7000, message: 'Session settlement failed.' },
    };
    if (!(key in table)) throw new Error(`unknown sdk key ${key}`);
    return table[key];
  }),
  buildApprovedNamespaces: vi.fn(),
}));
vi.mock('../router.js', () => ({ SUPPORTED_CHAIN_IDS: new Set([1]) }));
vi.mock('../../../../lib/analytics.js', () => ({ emit: emitMock }));

vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

const { rejectRequest, _buildRejectError } = await import('../session.js');

describe('L-5 — rejectRequest honours the caller-supplied reason', () => {
  beforeEach(() => {
    respondMock.mockClear();
    emitMock.mockClear();
  });

  it('maps a known WC SDK key to getSdkError()', async () => {
    await rejectRequest('topic-1', 42, 'UNSUPPORTED_METHODS');
    expect(respondMock).toHaveBeenCalledWith({
      topic: 'topic-1',
      response: { id: 42, jsonrpc: '2.0', error: { code: 5101, message: 'Unsupported methods.' } },
    });
  });

  it('wraps a Veyrnox-internal policy code in a {code:4001, message} envelope', async () => {
    await rejectRequest('topic-2', 43, 'PERSONAL_SIGN_ADDRESS_MISMATCH');
    expect(respondMock).toHaveBeenCalledWith({
      topic: 'topic-2',
      response: { id: 43, jsonrpc: '2.0', error: { code: 4001, message: 'PERSONAL_SIGN_ADDRESS_MISMATCH' } },
    });
  });

  it('falls back to USER_REJECTED when no reason is supplied', async () => {
    await rejectRequest('topic-3', 44);
    expect(respondMock).toHaveBeenCalledWith({
      topic: 'topic-3',
      response: { id: 44, jsonrpc: '2.0', error: { code: 5000, message: 'User rejected.' } },
    });
  });

  it('emits a structured audit event carrying topic, id, and reason', async () => {
    await rejectRequest('topic-4', 45, 'CHAIN_ID_MISMATCH');
    expect(emitMock).toHaveBeenCalledWith('dapp_request_rejected', {
      topic: 'topic-4',
      id: 45,
      reason: 'CHAIN_ID_MISMATCH',
    });
  });

  it('still responds even if the audit emit throws (best-effort)', async () => {
    emitMock.mockRejectedValueOnce(new Error('analytics down'));
    await expect(rejectRequest('topic-5', 46, 'USER_REJECTED')).resolves.toBeUndefined();
    expect(respondMock).toHaveBeenCalledTimes(1);
  });

  it('_buildRejectError is a pure helper: known key → SDK envelope, else 4001 wrap', () => {
    expect(_buildRejectError('USER_DISCONNECTED')).toEqual({ code: 6000, message: 'User disconnected.' });
    expect(_buildRejectError('WC_TWO_FACTOR_REQUIRED')).toEqual({ code: 4001, message: 'WC_TWO_FACTOR_REQUIRED' });
    expect(_buildRejectError(undefined)).toEqual({ code: 5000, message: 'User rejected.' });
    expect(_buildRejectError('')).toEqual({ code: 5000, message: 'User rejected.' });
  });
});
