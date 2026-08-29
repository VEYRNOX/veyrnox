// src/wallet-core/evm/walletconnect/__tests__/router.signTransaction.test.js
//
// Weekly-audit 2026-08-25 L-4: eth_signTransaction was absent from
// BLOCKED_METHODS and from METHOD_MAP, so it classified as UNKNOWN.
//
// HONEST SCOPE: this is defence in depth, not a live hole. The method was
// already closed three ways downstream — session.js never advertises it in the
// approved namespace, RequestApprovalModal marks UNKNOWN requests approveBlocked
// and does not render an approve button, and its handleApprove throws. Blocking
// it here rejects it at the front door with a toast instead of relying on three
// UI-layer guards staying correct.

import { describe, it, expect } from 'vitest';
import { BLOCKED_METHODS, isBlocked } from '../router.js';

describe('L-4 — eth_signTransaction is rejected at the router', () => {
  it('eth_signTransaction is in BLOCKED_METHODS', () => {
    expect(BLOCKED_METHODS.has('eth_signTransaction')).toBe(true);
    expect(isBlocked('eth_signTransaction')).toBe(true);
  });

  it('eth_sendTransaction remains allowed (the gated path is untouched)', () => {
    expect(isBlocked('eth_sendTransaction')).toBe(false);
  });
});
