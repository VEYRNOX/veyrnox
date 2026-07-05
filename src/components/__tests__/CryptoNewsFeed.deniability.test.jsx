// @ts-nocheck
// src/components/__tests__/CryptoNewsFeed.deniability.test.js
//
// I3 deniability guard. CryptoNewsFeed fires a useQuery on mount that calls
// api.rss2json.com (a third-party RSS proxy) every time the Dashboard /
// NewsSentiment page renders. In a decoy or hidden session that is unauthorised
// network egress, violating I3 (deniable sessions make zero backend calls). The
// query is enabled-gated on !isDecoy && !isHidden — BUT react-query v5
// refetch() bypasses `enabled` and fires the queryFn directly. So the refresh
// and Retry buttons that call refetch() MUST be hidden in a deniability session,
// or tapping them is live egress.
//
// Honesty: when disabled the component must render a neutral placeholder, NOT an
// error state, so an observer cannot tell a deniability session from a load.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../CryptoNewsFeed.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('CryptoNewsFeed — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('gates the news useQuery enabled on !isDecoy && !isHidden', () => {
    expect(code).toMatch(/!isDecoy\s*&&\s*!isHidden/);
    expect(code).toMatch(/enabled\s*:/);
  });

  it('the deniability guard precedes the news query definition', () => {
    const guard = code.search(/!isDecoy\s*&&\s*!isHidden/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(code.indexOf('fetchCryptoNews,'));
  });
});

// --- behavioral: refetch() trigger must not be reachable in deniability ---

const walletState = { isDecoy: false, isHidden: false };
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

let CryptoNewsFeed;
beforeEach(async () => {
  walletState.isDecoy = false;
  walletState.isHidden = false;
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })
  );
  ({ default: CryptoNewsFeed } = await import('@/components/CryptoNewsFeed'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderFeed() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CryptoNewsFeed />
    </QueryClientProvider>
  );
}

describe('CryptoNewsFeed — I3 refetch() trigger (behavioral)', () => {
  it('hides the refresh button in a decoy session (no refetch() egress)', () => {
    walletState.isDecoy = true;
    renderFeed();
    const btn = screen.queryByLabelText(/refresh market news/i);
    expect(btn).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('hides the refresh button in a hidden session', () => {
    walletState.isHidden = true;
    renderFeed();
    expect(screen.queryByLabelText(/refresh market news/i)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the refresh button in a normal session', () => {
    renderFeed();
    expect(screen.queryByLabelText(/refresh market news/i)).not.toBeNull();
  });
});
