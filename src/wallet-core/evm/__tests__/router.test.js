import { describe, it, expect } from 'vitest';
import {
  classifyRequest,
  isBlocked,
  REQUEST_TYPES,
  BLOCKED_METHODS,
} from '../walletconnect/router.js';

describe('walletconnect router — typed-data version safety (H6)', () => {
  // eth_signTypedData (v1) and v3 use different encoding from v4.
  // Routing them to the v4 SIGN_TYPED_DATA handler signs a different
  // hash than the user is shown — a malicious dApp can exploit that.
  // They must be blocked at the router, never routed to v4.

  it('blocks eth_signTypedData (v1)', () => {
    expect(isBlocked('eth_signTypedData')).toBe(true);
    expect(BLOCKED_METHODS.has('eth_signTypedData')).toBe(true);
  });

  it('blocks eth_signTypedData_v3', () => {
    expect(isBlocked('eth_signTypedData_v3')).toBe(true);
    expect(BLOCKED_METHODS.has('eth_signTypedData_v3')).toBe(true);
  });

  // Classification and blocking are independent: v1/v3 are classified as
  // SIGN_TYPED_DATA_UNSUPPORTED (an honest label — they are NOT the safely
  // handled v4 variant) and isBlocked gates them before any handler runs.
  // The security control is the block, not the label.
  it('classifies v1 and v3 as SIGN_TYPED_DATA_UNSUPPORTED and keeps them blocked', () => {
    expect(classifyRequest('eth_signTypedData')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA_UNSUPPORTED);
    expect(classifyRequest('eth_signTypedData_v3')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA_UNSUPPORTED);
    expect(isBlocked('eth_signTypedData')).toBe(true);
    expect(isBlocked('eth_signTypedData_v3')).toBe(true);
  });

  it('still routes v4 to SIGN_TYPED_DATA and does not block it', () => {
    expect(classifyRequest('eth_signTypedData_v4')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
    expect(isBlocked('eth_signTypedData_v4')).toBe(false);
  });

  it('still blocks eth_sign', () => {
    expect(isBlocked('eth_sign')).toBe(true);
  });
});
