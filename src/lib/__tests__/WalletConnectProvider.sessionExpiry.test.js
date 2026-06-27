// M11 — WalletConnect session expiry must be ENFORCED client-side, not merely
// displayed. A signing request arriving on a session whose `expiry` (Unix seconds)
// is in the past must be rejected (fail closed, I4) before any key is touched.
//
// Pure helper: checkSessionExpiry(session, nowMs) → { ok } | { ok:false, code }.

import { describe, it, expect } from 'vitest';
import { checkSessionExpiry } from '@/lib/WalletConnectProvider.jsx';

const NOW = 1_700_000_000_000; // fixed ms
const SECS = NOW / 1000;

describe('checkSessionExpiry (M11)', () => {
  it('accepts a session whose expiry is in the future', () => {
    const res = checkSessionExpiry({ expiry: SECS + 3600 }, NOW);
    expect(res.ok).toBe(true);
  });

  it('rejects a session whose expiry is in the past', () => {
    const res = checkSessionExpiry({ expiry: SECS - 1 }, NOW);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('SESSION_EXPIRED');
  });

  it('rejects exactly at the expiry boundary (expired = not signable)', () => {
    const res = checkSessionExpiry({ expiry: SECS }, NOW);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('SESSION_EXPIRED');
  });

  it('rejects when the session is missing', () => {
    const res = checkSessionExpiry(undefined, NOW);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects when expiry is absent or non-numeric (fail closed)', () => {
    expect(checkSessionExpiry({}, NOW).code).toBe('SESSION_EXPIRED');
    expect(checkSessionExpiry({ expiry: 'soon' }, NOW).code).toBe('SESSION_EXPIRED');
  });
});
