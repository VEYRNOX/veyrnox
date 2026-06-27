// M6: revealWalletMnemonic must enforce a fresh re-auth window INSIDE the
// function (defense-in-depth), not trust a caller-set flag. The reveal gate
// math is extracted to a pure helper so it can be pinned here directly.
import { describe, it, expect } from 'vitest';
import { assertRevealReauthFresh, REAUTH_WINDOW_MS } from '@/lib/WalletProvider';

describe('M6 reveal re-auth enforcement', () => {
  const now = 1_000_000_000;

  it('throws REVEAL_REQUIRES_REAUTH when lastAuthAt is null', () => {
    expect(() => assertRevealReauthFresh({ lastAuthAt: null, now }))
      .toThrowError(/REVEAL_REQUIRES_REAUTH/);
  });

  it('throws REVEAL_REQUIRES_REAUTH when lastAuthAt is stale (older than the window)', () => {
    const stale = now - REAUTH_WINDOW_MS - 1;
    expect(() => assertRevealReauthFresh({ lastAuthAt: stale, now }))
      .toThrowError(/REVEAL_REQUIRES_REAUTH/);
  });

  it('passes (no throw) when lastAuthAt is recent (within the window)', () => {
    const recent = now - (REAUTH_WINDOW_MS - 1);
    expect(() => assertRevealReauthFresh({ lastAuthAt: recent, now })).not.toThrow();
  });

  it('passes at exactly the window boundary', () => {
    const boundary = now - REAUTH_WINDOW_MS;
    expect(() => assertRevealReauthFresh({ lastAuthAt: boundary, now })).not.toThrow();
  });
});
