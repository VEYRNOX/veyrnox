// I4 defense-in-depth: approveSession must fail closed on a known-bad dApp
// domain even if the UI block is bypassed. The key is never touched and the
// SDK approveSession is never called. Asserts the machine error code, not copy.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

import {
  approveSession,
  __setTestClient,
  __injectPendingProposal,
} from '../walletconnect/session.js';

describe('approveSession — I4 known-bad domain gate', () => {
  let approveSpy;

  beforeEach(() => {
    approveSpy = vi.fn(async () => {});
    __setTestClient({
      approveSession: approveSpy,
      rejectSession: vi.fn(async () => {}),
    });
  });

  it('throws DAPP_BLOCKED_KNOWN_BAD and never calls client.approveSession for a flagged dApp', async () => {
    __injectPendingProposal({
      id: 555,
      params: {
        proposer: { metadata: { url: 'https://fakeswap-rewards.xyz' } },
        requiredNamespaces: {},
        optionalNamespaces: {},
      },
    });

    await expect(
      approveSession(555, '0xabc0000000000000000000000000000000000abc', [11155111]),
    ).rejects.toMatchObject({ code: 'DAPP_BLOCKED_KNOWN_BAD' });

    expect(approveSpy).not.toHaveBeenCalled();
  });

  it('does not block a clean dApp domain on the same path', async () => {
    __injectPendingProposal({
      id: 556,
      params: {
        proposer: { metadata: { url: 'https://app.uniswap.org' } },
        requiredNamespaces: {},
        optionalNamespaces: {},
      },
    });

    // Reaches buildApprovedNamespaces / client.approveSession (no domain throw).
    await approveSession(556, '0xabc0000000000000000000000000000000000abc', [11155111]);
    expect(approveSpy).toHaveBeenCalledTimes(1);
  });
});
