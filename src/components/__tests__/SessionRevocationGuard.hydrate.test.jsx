// REVIEW-A regression — the guard must still arm when the session token only
// becomes readable AFTER it has mounted.
//
// getSessionToken() is a synchronous read of secureStore's cache, and on native
// that cache is filled by an async boot hydrate. Reading it once at render is
// not enough on its own: mounting before hydrate settles leaves the token null,
// the revocation query disabled, and nothing re-subscribing when the value
// arrives — the guard would sit dormant until an unrelated re-render happened
// to re-read it. These cases pin the deterministic behaviour: await the
// memoised hydrate promise, then re-read.
//
// (In production Layout only mounts after unlock, by which point hydrate has
// long finished. This was latent fragility, not an observed failure — which is
// exactly why it needs a test rather than a comment.)

import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  token: null,
  releaseHydrate: null,
  hydratePromise: null,
}));

vi.mock('@/lib/secureStore', () => ({
  hydrateSecureStore: vi.fn(() => h.hydratePromise),
}));

vi.mock('@/lib/sessionRevocation', () => ({
  getSessionToken: vi.fn(() => h.token),
  clearSessionToken: vi.fn(),
  isCurrentSessionRevoked: vi.fn(() => false),
}));

vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ lock: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { UserSession: { filter: vi.fn(async () => []) } } },
}));

import SessionRevocationGuard from '../SessionRevocationGuard';
import { base44 } from '@/api/base44Client';

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SessionRevocationGuard />
  </QueryClientProvider>,
);

beforeEach(() => {
  h.token = null;
  h.hydratePromise = new Promise((r) => { h.releaseHydrate = r; });
  base44.entities.UserSession.filter.mockClear();
});

describe('SessionRevocationGuard — late hydrate', () => {
  it('arms once hydrate fills the token that was unreadable at mount', async () => {
    wrap();

    // Pre-hydrate: no token, so the revocation query must stay disabled rather
    // than poll for `undefined`.
    expect(base44.entities.UserSession.filter).not.toHaveBeenCalled();

    h.token = 'token-from-keychain';
    h.releaseHydrate();

    await waitFor(() => expect(base44.entities.UserSession.filter)
      .toHaveBeenCalledWith({ session_token: 'token-from-keychain' }));
  });

  it('polls immediately when the token is already readable at mount', async () => {
    h.token = 'already-hydrated';
    wrap();

    await waitFor(() => expect(base44.entities.UserSession.filter)
      .toHaveBeenCalledWith({ session_token: 'already-hydrated' }));
    h.releaseHydrate();
  });

  it('stays disabled when hydrate settles with no token at all', async () => {
    wrap();
    h.releaseHydrate();
    await h.hydratePromise;

    // A device with nothing stored must not start polling for a null token —
    // ensureSessionToken() is what mints one, not this guard.
    await waitFor(() => expect(base44.entities.UserSession.filter).not.toHaveBeenCalled());
  });
});
