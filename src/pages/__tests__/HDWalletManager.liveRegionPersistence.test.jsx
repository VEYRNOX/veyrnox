// Behavioural regression test for the F7 persistent-live-region fix
// (2026-07-20 branch review).
//
// Root cause: AssetLiveBalance/BtcLiveBalance/SolLiveBalance used to return
// THREE DIFFERENT top-level components (BalancePending / BalanceUnavailable /
// a plain value <span>) at the same JSX position depending on query state.
// React unmounts+remounts a subtree whenever the element TYPE at a tree
// position changes between renders, so the role="status" node itself was
// destroyed and a fresh one created on every loading->error / loading->
// resolved transition. Most assistive tech only announces a MUTATION to a
// live region it is already watching — a freshly-inserted node is usually
// treated as new content, not a live update — so the transition was silent.
//
// The fix (BalanceStatus in HDWalletManager.jsx) renders ONE role="status"
// node unconditionally and only swaps its children. These tests assert DOM
// NODE IDENTITY survives a state transition — a source-string grep cannot
// prove this, only real reconciliation behaviour can.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const getBalanceEth = vi.fn();
vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: (...a) => getBalanceEth(...a),
}));
vi.mock('@/wallet-core/evm/networks', () => ({
  getNetworkInfo: () => ({ name: 'Ethereum (test)', symbol: 'ETH' }),
}));
vi.mock('@/wallet-core/evm/token-send', () => ({
  getTokenBalance: vi.fn(),
}));

let AssetLiveBalance;
let BalanceStatus;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ AssetLiveBalance, BalanceStatus } = await import('../HDWalletManager.jsx'));
});

afterEach(() => {
  cleanup();
});

function renderWithClient(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('BalanceStatus — one persistent node, content changes with state', () => {
  it('is the SAME DOM node across pending -> resolved(idle) -> error', () => {
    const { container, rerender } = render(<BalanceStatus state="pending" />);
    const node1 = container.querySelector('[role="status"]');
    expect(node1).toBeTruthy();
    expect(node1.textContent).toContain('Loading balance');

    rerender(<BalanceStatus state={null} />);
    const node2 = container.querySelector('[role="status"]');
    expect(node2).toBe(node1); // same underlying DOM node — content mutated, not replaced
    expect(node2.textContent).toBe('');

    rerender(<BalanceStatus state="error" />);
    const node3 = container.querySelector('[role="status"]');
    expect(node3).toBe(node1);
    expect(node3.textContent).toContain('Balance unavailable');
  });
});

describe('AssetLiveBalance — persistent live region across the real query lifecycle (F7)', () => {
  it('keeps the SAME role="status" DOM node from loading through to a resolved balance', async () => {
    let resolveBalance;
    getBalanceEth.mockReturnValue(new Promise((res) => { resolveBalance = res; }));

    const asset = { chain: 'sepolia', family: 'native', symbol: 'ETH' };
    const { container } = renderWithClient(
      <AssetLiveBalance asset={asset} address="0xabc" />
    );

    const statusBefore = container.querySelector('[role="status"]');
    expect(statusBefore, 'no persistent status node on the loading render').toBeTruthy();
    expect(statusBefore.textContent).toContain('Loading balance');
    // Resolved amount must not exist yet.
    expect(container.textContent).not.toContain('ETH');

    resolveBalance(1.5);
    await waitFor(() => expect(container.textContent).toContain('ETH'));

    const statusAfter = container.querySelector('[role="status"]');
    expect(statusAfter, 'status node vanished after resolving').toBeTruthy();
    expect(statusAfter).toBe(statusBefore);
    // Idle once resolved — the value itself lives OUTSIDE the live region so
    // a 20-30s background poll does not re-announce it (pre-existing,
    // deliberately preserved design constraint; see HDWalletManager.a11yMono
    // test "does NOT put a live region on the resolved amount").
    expect(statusAfter.textContent).toBe('');
  });

  it('keeps the SAME role="status" DOM node from loading through to an error', async () => {
    getBalanceEth.mockRejectedValue(new Error('rpc down'));
    const asset = { chain: 'sepolia', family: 'native', symbol: 'ETH' };
    const { container } = renderWithClient(
      <AssetLiveBalance asset={asset} address="0xabc" />
    );

    const statusBefore = container.querySelector('[role="status"]');
    expect(statusBefore.textContent).toContain('Loading balance');

    await waitFor(() => expect(container.textContent).toContain('Balance unavailable'), { timeout: 3000 });
    const statusAfter = container.querySelector('[role="status"]');
    expect(statusAfter).toBe(statusBefore);
  });
});
