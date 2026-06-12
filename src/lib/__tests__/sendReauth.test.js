import { describe, it, expect } from 'vitest';
import { sendReauthRequired, REAUTH_WINDOW_MS } from '../sendReauth.js';

describe('sendReauthRequired', () => {
  it('REAUTH_WINDOW_MS is 2 minutes', () => {
    expect(REAUTH_WINDOW_MS).toBe(2 * 60 * 1000);
  });
  it('false within the window (recently authenticated)', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - 60_000, now, windowMs: REAUTH_WINDOW_MS })).toBe(false);
  });
  it('true once the window has lapsed', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - 130_000, now, windowMs: REAUTH_WINDOW_MS })).toBe(true);
  });
  it('true when lastAuthAt is null — fail closed', () => {
    expect(sendReauthRequired({ lastAuthAt: null, now: 1_000_000, windowMs: REAUTH_WINDOW_MS })).toBe(true);
  });
  it('exactly at the boundary is NOT required (<=, not <)', () => {
    const now = 1_000_000;
    expect(sendReauthRequired({ lastAuthAt: now - REAUTH_WINDOW_MS, now, windowMs: REAUTH_WINDOW_MS })).toBe(false);
  });
});
