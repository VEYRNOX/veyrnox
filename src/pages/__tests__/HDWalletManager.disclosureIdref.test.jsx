// Behavioural regression test for the F5 dangling-IDREF fix
// (2026-07-20 branch review): the per-asset disclosure button set
// aria-controls={`asset-panel-${asset.symbol}`} UNCONDITIONALLY, but the
// panel it names only exists in the DOM while the row is expanded — a
// dangling reference for all ten rows in their default (collapsed) state.
//
// Fix: aria-controls is only set once the panel it names actually exists
// (`exp ? id : undefined`) — see the comment at the button in
// HDWalletManager.jsx. aria-expanded already carried the open/closed state
// correctly (impact of the dangling IDREF alone was low), so this proves the
// full contract: no dangling reference while collapsed, and a VALID
// reference to a real, present element once expanded.
//
// This requires a full render of the unlocked wallet-manager surface, so the
// test carries a fair amount of mocking scaffolding (useWallet, base44, RASP,
// the three chain balance providers) — all just enough to get one asset row
// to a stable "unlocked, address known" state without touching any vault/
// signing logic.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const walletCtx = {
  isUnlocked: true,
  accounts: [{ address: '0x1111111111111111111111111111111111111111', index: 0 }],
  unlock: vi.fn(),
  lock: vi.fn(),
  hasVault: vi.fn().mockResolvedValue(true),
  deriveAccounts: vi.fn(() => []),
  btcAccount: { address: 'bcrt1qexampleexampleexampleexampleexamp', path: "m/84'/0'/0'/0/0" },
  solAccount: { address: 'SoLExampLeExampLeExampLeExampLeExampLeExa1', path: "m/44'/501'/0'/0'" },
};
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletCtx,
}));

vi.mock('@/api/base44Client', () => ({
  base44: { entities: { Wallet: { filter: vi.fn().mockResolvedValue([]), create: vi.fn() } } },
}));

vi.mock('@/rasp', () => ({
  useRaspArtifact: () => null,
  sensitiveGate: () => ({ blocked: false }),
}));

vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: vi.fn().mockResolvedValue(1.23456),
}));
vi.mock('@/wallet-core/evm/token-send', () => ({
  getTokenBalance: vi.fn().mockResolvedValue(2),
}));
vi.mock('@/wallet-core/btc/provider', () => ({
  getBalanceSats: vi.fn().mockResolvedValue(50000),
}));
vi.mock('@/wallet-core/sol/provider', () => ({
  getBalanceSol: vi.fn().mockResolvedValue(3),
}));

let HDWalletManager;

beforeEach(async () => {
  vi.clearAllMocks();
  walletCtx.hasVault.mockResolvedValue(true);
  ({ default: HDWalletManager } = await import('../HDWalletManager.jsx'));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HDWalletManager />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HDWalletManager — asset disclosure aria-controls (F5)', () => {
  it('has NO aria-controls while collapsed (default state for every row)', async () => {
    renderPage();
    const ethButton = await screen.findByRole('button', { name: /ethereum/i });
    expect(ethButton.getAttribute('aria-expanded')).toBe('false');
    expect(ethButton.hasAttribute('aria-controls')).toBe(false);
  });

  it('points aria-controls at a REAL, present element once expanded', async () => {
    renderPage();
    const ethButton = await screen.findByRole('button', { name: /ethereum/i });

    fireEvent.click(ethButton);

    await waitFor(() => expect(ethButton.getAttribute('aria-expanded')).toBe('true'));
    const controlsId = ethButton.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    const panel = document.getElementById(/** @type {string} */ (controlsId));
    expect(panel, 'aria-controls points at an id that does not exist in the DOM').toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('region');
  });

  it('drops aria-controls again on collapse (never left dangling on re-collapse)', async () => {
    renderPage();
    const ethButton = await screen.findByRole('button', { name: /ethereum/i });

    fireEvent.click(ethButton); // expand
    await waitFor(() => expect(ethButton.getAttribute('aria-expanded')).toBe('true'));
    const controlsId = ethButton.getAttribute('aria-controls');

    fireEvent.click(ethButton); // collapse
    await waitFor(() => expect(ethButton.getAttribute('aria-expanded')).toBe('false'));

    expect(ethButton.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(/** @type {string} */ (controlsId))).toBeNull();
  });
});
