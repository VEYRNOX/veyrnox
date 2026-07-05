// F-07-WC — the CAIP-2 chain a typed-data signature is bound to must come from
// the live session store, not a caller-supplied prop. resolveSessionCaip2 pins
// the contract: the request chain must be one the session actually approved.

import { describe, it, expect } from 'vitest';
import { resolveSessionCaip2 } from '@/lib/WalletConnectProvider.jsx';

const session = (chains) => ({ namespaces: { eip155: { chains } } });

describe('resolveSessionCaip2 (F-07-WC — session-store chain binding)', () => {
  it('returns the request chain when the session approved it', () => {
    const s = session(['eip155:1', 'eip155:11155111']);
    expect(resolveSessionCaip2(s, 'eip155:11155111')).toBe('eip155:11155111');
  });

  it('returns null when the request chain is NOT approved (fail closed, I4)', () => {
    const s = session(['eip155:1']);
    expect(resolveSessionCaip2(s, 'eip155:137')).toBeNull();
  });

  it('uses the sole approved chain when the request omits a chain', () => {
    const s = session(['eip155:11155111']);
    expect(resolveSessionCaip2(s, undefined)).toBe('eip155:11155111');
  });

  it('returns null when request omits chain and session has multiple', () => {
    const s = session(['eip155:1', 'eip155:137']);
    expect(resolveSessionCaip2(s, undefined)).toBeNull();
  });

  it('returns null for a missing/empty session (fail closed)', () => {
    expect(resolveSessionCaip2(undefined, 'eip155:1')).toBeNull();
    expect(resolveSessionCaip2(session([]), 'eip155:1')).toBeNull();
  });
});
