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

  it('does NOT route v1 or v3 to the v4 SIGN_TYPED_DATA bucket', () => {
    expect(classifyRequest('eth_signTypedData')).not.toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
    expect(classifyRequest('eth_signTypedData_v3')).not.toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
  });

  it('still routes v4 to SIGN_TYPED_DATA and does not block it', () => {
    expect(classifyRequest('eth_signTypedData_v4')).toBe(REQUEST_TYPES.SIGN_TYPED_DATA);
    expect(isBlocked('eth_signTypedData_v4')).toBe(false);
  });

  it('still blocks eth_sign', () => {
    expect(isBlocked('eth_sign')).toBe(true);
  });
});
