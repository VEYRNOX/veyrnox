// @ts-nocheck
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// M7 — In a decoy/hidden session, LoginActivity must NOT call the backend
// (I3: deniability mode makes zero backend calls). We gate this by asserting
// the useQuery `enabled` option is false and that the queryFn / backend list
// is never invoked.

const listSpy = vi.fn(() => Promise.resolve([]));
const useQuerySpy = vi.fn(() => ({ data: [], isLoading: false, isError: false }));

const walletState = { lastUnlockAt: null, isDecoy: false, isHidden: false };

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { UserSession: { list: (...a) => listSpy(...a) } } },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts) => useQuerySpy(opts),
}));

import LoginActivity from '@/pages/LoginActivity';

describe('LoginActivity deniability (M7)', () => {
  beforeEach(() => {
    listSpy.mockClear();
    useQuerySpy.mockClear();
    walletState.lastUnlockAt = null;
    walletState.isDecoy = false;
    walletState.isHidden = false;
  });

  it('enables the backend query in a normal session', () => {
    walletState.isDecoy = false;
    walletState.isHidden = false;
    render(<LoginActivity />);
    const opts = useQuerySpy.mock.calls[0][0];
    expect(opts.enabled).toBe(true);
  });

  it('disables the backend query in a decoy session (no backend call)', () => {
    walletState.isDecoy = true;
    render(<LoginActivity />);
    const opts = useQuerySpy.mock.calls[0][0];
    expect(opts.enabled).toBe(false);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('disables the backend query in a hidden session (no backend call)', () => {
    walletState.isHidden = true;
    render(<LoginActivity />);
    const opts = useQuerySpy.mock.calls[0][0];
    expect(opts.enabled).toBe(false);
    expect(listSpy).not.toHaveBeenCalled();
  });
});
