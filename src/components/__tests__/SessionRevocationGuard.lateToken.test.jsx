// SEC-03 (QA 2026-09-21) — revoking the CURRENT device must lock the session
// that minted the token, even though that token did not exist when the guard
// mounted.
//
// Layout mounts the guard at unlock. On a fresh wallet no session token exists
// yet; Security Center mints one later (ensureSessionToken) in the SAME
// session. The guard used to capture the token once (useState + one hydrate
// re-read), so the late token was never seen, the query stayed disabled, and
// "Takes effect immediately" was false: the revoked session stayed unlocked.
//
// Uses the REAL lib/sessionRevocation (token accessor + revoked predicate) —
// only the storage backend, the entity store and the lock sink are stubbed.

import { render, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map(), rows: [], lock: null }));

vi.mock('@/lib/secureStore', () => ({
  hydrateSecureStore: vi.fn(() => Promise.resolve()),
  secureGet: (k) => (h.store.has(k) ? h.store.get(k) : null),
  secureSet: (k, v) => { h.store.set(k, v); },
  secureRemove: (k) => { h.store.delete(k); },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ lock: h.lock }) }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { UserSession: { filter: vi.fn(async ({ session_token }) =>
    h.rows.filter((r) => r.session_token === session_token)) } } },
}));

import SessionRevocationGuard from '../SessionRevocationGuard';
import { ensureSessionToken, getSessionToken } from '@/lib/sessionRevocation';
import { base44 } from '@/api/base44Client';

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SessionRevocationGuard />
  </QueryClientProvider>,
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.store.clear();
  h.rows = [];
  h.lock = vi.fn();
  base44.entities.UserSession.filter.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('SessionRevocationGuard — token minted after mount (SEC-03)', () => {
  it('locks when the session minted AFTER mount is revoked', async () => {
    wrap(); // fresh wallet: no token yet
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Security Center registers this device later in the same session.
    const token = ensureSessionToken();
    h.rows = [{ session_token: token, status: 'active' }];

    // Session Manager revokes the current device.
    h.rows = [{ session_token: token, status: 'revoked' }];

    // Within the guard's poll interval (10 s), the revoke must take effect.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    await waitFor(() => expect(h.lock).toHaveBeenCalledTimes(1));
    expect(getSessionToken()).toBeNull(); // signed out → re-auth mints a new one
  });

  it('never polls the store while no token exists (no egress for nothing)', async () => {
    wrap();
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(base44.entities.UserSession.filter).not.toHaveBeenCalled();
    expect(h.lock).not.toHaveBeenCalled();
  });

  it('does not lock while the late-minted session is still active', async () => {
    wrap();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // mount + hydrate settle first
    const token = ensureSessionToken();
    h.rows = [{ session_token: token, status: 'active' }];
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    await waitFor(() => expect(base44.entities.UserSession.filter)
      .toHaveBeenCalledWith({ session_token: token }));
    expect(h.lock).not.toHaveBeenCalled();
  });
});
