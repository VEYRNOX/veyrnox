// @ts-nocheck
// src/pages/__tests__/Calculator.deniability.test.js
//
// I3 deniability guard. The Calculator fetches CoinGecko prices via useQuery
// when the user navigates to it. Live prices default ON, so the enabled
// (isLivePricesEnabled()) lets it fetch in a decoy/hidden session — gated by
// also folding in !isDecoy && !isHidden. BUT react-query v5 refetch() bypasses
// `enabled`, so the "Refresh" button that calls refetch() MUST be hidden in a
// deniability session, or tapping it hits CoinGecko. When disabled the page
// shows its "Live prices off" static state — no network call, no error reveal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../Calculator.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('Calculator — I3 deniability structural guards (source scan)', () => {
  it('pulls isDecoy/isHidden from useWallet()', () => {
    expect(code).toMatch(/useWallet\s*\(\s*\)/);
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
  });

  it('folds !isDecoy && !isHidden into the price-query enabled condition', () => {
    expect(code).toMatch(/isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden/);
  });
});

// DEMO egress suppression (M-6 class, PR #617): the veyrnox-live-prices opt-in is
// device-global, not demo-scoped — a browser that once opted in would fetch
// CoinGecko inside a demo tour (isDecoy/isHidden are both false in demo). The
// enabled condition must also fold in !DEMO.
describe('Calculator — DEMO egress suppression (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('folds !DEMO into the price-query enabled condition', () => {
    expect(code).toMatch(
      /isLivePricesEnabled\(\)\s*&&\s*!isDecoy\s*&&\s*!isHidden\s*&&\s*!DEMO/
    );
  });

  it('the DEMO gate precedes the price query definition', () => {
    const guard = code.search(/!isHidden\s*&&\s*!DEMO/);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(code.indexOf('queryFn: fetchPrices'));
  });
});

// --- behavioral: refetch() trigger must not be reachable in deniability ---

if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

const walletState = { isDecoy: false, isHidden: false };
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => walletState,
}));

const fetchSpy = vi.fn(() => Promise.resolve({}));
vi.mock('@/lib/coinGecko.js', () => ({
  fetchMarketPricesFiatCG: (...a) => fetchSpy(...a),
}));

let Calculator;
beforeEach(async () => {
  walletState.isDecoy = false;
  walletState.isHidden = false;
  fetchSpy.mockClear();
  // Live prices are OFF by default (I2-LIVEPRICE-DEFAULT-ON fix: absent = off).
  // Turn them ON here so these tests exercise the DENIABILITY gate specifically —
  // otherwise the button would be hidden by the pref, not by isDecoy/isHidden.
  try { localStorage.setItem('veyrnox-live-prices', '1'); } catch { /* shimmed */ }
  ({ default: Calculator } = await import('@/pages/Calculator'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCalc() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Calculator />
    </QueryClientProvider>
  );
}

describe('Calculator — I3 refetch() trigger (behavioral)', () => {
  it('hides the Refresh button in a decoy session (no refetch() egress)', () => {
    walletState.isDecoy = true;
    renderCalc();
    expect(screen.queryByText(/Refresh|Updated/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hides the Refresh button in a hidden session', () => {
    walletState.isHidden = true;
    renderCalc();
    expect(screen.queryByText(/Refresh|Updated/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the Refresh button in a normal session with live prices', () => {
    renderCalc();
    expect(screen.queryByText(/Refresh|Updated/i)).not.toBeNull();
  });
});
