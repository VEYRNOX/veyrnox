// src/wallet-core/evm/walletconnect/__tests__/router.wcfixes.test.js
//
// H6: eth_signTypedData (v1) and eth_signTypedData_v3 use an encoding that diverges
// from the v4 handler. They must be BLOCKED, not silently routed to the v4 path.

import { describe, it, expect } from 'vitest';
import { BLOCKED_METHODS, isBlocked } from '../router.js';

describe('H6 — signTypedData v1/v3 are blocked, not routed to v4', () => {
  it('eth_signTypedData (v1) is in BLOCKED_METHODS', () => {
    expect(BLOCKED_METHODS.has('eth_signTypedData')).toBe(true);
    expect(isBlocked('eth_signTypedData')).toBe(true);
  });

  it('eth_signTypedData_v3 is in BLOCKED_METHODS', () => {
    expect(BLOCKED_METHODS.has('eth_signTypedData_v3')).toBe(true);
    expect(isBlocked('eth_signTypedData_v3')).toBe(true);
  });

  it('eth_signTypedData_v4 remains allowed (not blocked)', () => {
    expect(isBlocked('eth_signTypedData_v4')).toBe(false);
  });
});
