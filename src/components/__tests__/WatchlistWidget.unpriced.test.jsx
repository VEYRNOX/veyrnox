// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const state = vi.hoisted(() => ({ items: [] }));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { PersonalWatchlist: {
    list: async () => state.items,
    create: vi.fn(),
    delete: vi.fn(),
  } } },
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({ isDecoy: false, isHidden: false }) }));
vi.mock('@/components/CoinLogo', () => ({ default: () => null }));

import WatchlistWidget from '../WatchlistWidget.jsx';

afterEach(() => cleanup());

function renderWidget() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><WatchlistWidget /></QueryClientProvider>);
}

describe('WatchlistWidget — unpriced symbols', () => {
  it('renders a receive-only token with no reference quote as unavailable without throwing', async () => {
    state.items = [
      { id: 'a', symbol: 'LINK' },
      { id: 'b', symbol: 'NOT_A_SYMBOL' },
    ];
    const { container } = renderWidget();
    await waitFor(() => expect(screen.getByText('LINK')).toBeTruthy());
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toMatch(/\$0(?![.\d])/);
    expect(container.textContent).not.toMatch(/NaN|null|undefined/);
  });

  it('still shows a priced symbol with its price and move', async () => {
    state.items = [{ id: 'c', symbol: 'ETH' }];
    const { container } = renderWidget();
    await waitFor(() => expect(screen.getByText('ETH')).toBeTruthy());
    expect(container.textContent).toMatch(/\$[\d,]+/);
    expect(container.textContent).toContain('%');
  });
});
