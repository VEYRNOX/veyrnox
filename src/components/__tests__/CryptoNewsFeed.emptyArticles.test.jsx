// STG-08 — a 200 response with an empty articles array is a successful-but-
// empty result, not a failure. fetchCryptoNews used to throw on an empty
// array, which made react-query report isError=true and rendered the same
// "Could not load news" text as a real network/proxy failure. It must instead
// hit the component's existing `news.length === 0` empty state.
//
// The real failure path (fetchNews rejecting) must still show the error state
// — this fix must not blur that distinction.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const walletState = { isDecoy: false, isHidden: false };
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

vi.mock('@/api/edgeApi', () => ({
  fetchNews: vi.fn(),
}));

import { fetchNews } from '@/api/edgeApi';
import CryptoNewsFeed from '@/components/CryptoNewsFeed';

function renderFeed() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CryptoNewsFeed />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  walletState.isDecoy = false;
  walletState.isHidden = false;
  fetchNews.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('CryptoNewsFeed — empty vs. failed fetch (STG-08)', () => {
  it('shows the neutral empty state, not "Could not load news", when the API returns zero articles', async () => {
    fetchNews.mockResolvedValue({ articles: [] });
    renderFeed();

    await waitFor(() => expect(screen.getByText(/no news available right now/i)).toBeTruthy());
    expect(screen.queryByText(/could not load news/i)).toBeNull();
  });

  it('still shows the honest failure state when the fetch actually rejects', async () => {
    fetchNews.mockRejectedValue(new Error('network down'));
    renderFeed();

    // The component's own useQuery sets retry: 1 (not overridable via this
    // QueryClient's defaults), so a rejection needs one retry-delay cycle
    // before isError settles -- give waitFor more than its 1000ms default.
    await waitFor(() => expect(screen.getByText(/could not load news/i)).toBeTruthy(), { timeout: 5000 });
  });
});
