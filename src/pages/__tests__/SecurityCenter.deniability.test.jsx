// @ts-nocheck
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// M2 — In a decoy/hidden session, SecurityCenter must NOT:
//   (a) register a session (write sdw_session_token UUID + UserSession
//       filter/create/update backend calls), or
//   (b) trigger the transaction-history backend query.
// (I2: no silent egress; I3: deniability mode makes zero backend calls.)
//
// We assert on machine behaviour: spies never called in decoy/hidden, and the
// transactions useQuery is registered with enabled:false.

const userSessionFilter = vi.fn(() => Promise.resolve([]));
const userSessionCreate = vi.fn(() => Promise.resolve({ id: 'x' }));
const userSessionUpdate = vi.fn(() => Promise.resolve({}));
const transactionList = vi.fn(() => Promise.resolve([]));

// Record every useQuery registration so we can inspect per-key `enabled`.
const queryCalls = [];
const useQuerySpy = vi.fn((opts) => {
  queryCalls.push(opts);
  return { data: [], isError: false };
});

const walletState = { isDecoy: false, isHidden: false };

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      UserSession: {
        filter: (...a) => userSessionFilter(...a),
        create: (...a) => userSessionCreate(...a),
        update: (...a) => userSessionUpdate(...a),
      },
      TransactionLimit: {
        list: () => Promise.resolve([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      Transaction: { list: (...a) => transactionList(...a) },
    },
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts) => useQuerySpy(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import SecurityCenter from '@/pages/SecurityCenter';

function txQuery() {
  return queryCalls.find((q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'transactions');
}

describe('SecurityCenter deniability (M2)', () => {
  beforeEach(() => {
    userSessionFilter.mockClear();
    userSessionCreate.mockClear();
    userSessionUpdate.mockClear();
    transactionList.mockClear();
    useQuerySpy.mockClear();
    queryCalls.length = 0;
    walletState.isDecoy = false;
    walletState.isHidden = false;
    localStorage.clear();
  });

  it('registers session and enables tx-history query in a normal session', () => {
    render(<SecurityCenter />);
    expect(userSessionFilter).toHaveBeenCalled();
    expect(txQuery().enabled).toBe(true);
  });

  it('does not register a session in a decoy session (no UUID write, no backend call)', () => {
    walletState.isDecoy = true;
    render(<SecurityCenter />);
    expect(userSessionFilter).not.toHaveBeenCalled();
    expect(userSessionCreate).not.toHaveBeenCalled();
    expect(userSessionUpdate).not.toHaveBeenCalled();
    expect(localStorage.getItem('sdw_session_token')).toBeNull();
  });

  it('does not trigger the tx-history query in a decoy session', () => {
    walletState.isDecoy = true;
    render(<SecurityCenter />);
    expect(txQuery().enabled).toBe(false);
    expect(transactionList).not.toHaveBeenCalled();
  });

  it('does not register a session or query in a hidden session', () => {
    walletState.isHidden = true;
    render(<SecurityCenter />);
    expect(userSessionFilter).not.toHaveBeenCalled();
    expect(userSessionCreate).not.toHaveBeenCalled();
    expect(localStorage.getItem('sdw_session_token')).toBeNull();
    expect(txQuery().enabled).toBe(false);
  });
});
