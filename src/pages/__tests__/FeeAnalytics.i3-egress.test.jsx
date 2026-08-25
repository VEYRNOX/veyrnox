// src/pages/__tests__/FeeAnalytics.i3-egress.test.jsx
//
// I3 zero-egress for the fee-analytics page, asserted as an INVARIANT rather
// than as a source spelling. The previous version of this file regex-matched
// `enabled: !isDeniabilitySessionActive()` in the source, which described the
// then-current wording and would have gone red on any correct fix — including
// the one that closes the hole it was supposed to guard.
//
// The invariant, in two halves:
//   1. In a deniability (decoy/hidden) session the history query must not run
//      at all — fetchAssetHistory is never called.
//   2. Whenever demo OR deniability is live, the query must NOT carry the real
//      derived address. That includes the POST-IMPORT-FLIP window: `DEMO` in
//      api/demoClient is a load-time IIFE snapshot, so a `veyrnox-demo=1` set
//      after module import leaves DEMO false while isDeniabilityOrDemoActive()
//      is already true. Gating the data path on DEMO alone sent the real
//      per-asset address to the indexer with `demo: false` in exactly that
//      window.
// Plus a negative control: an ordinary live session MUST still send the real
// address, so a gate that refused everything cannot pass this file.
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const REAL_BTC_ADDRESS = 'tb1qrealaddressshouldneverleakxxxxxxxxxxxxx';

// Live-read helpers, controlled per test. These mirror the real module: DEMO is
// a snapshot, these two are read live on every call.
const deniability = { session: false, orDemo: false };
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilitySessionActive: () => deniability.session,
  isDeniabilityOrDemoActive: () => deniability.orDemo,
}));

// The load-time snapshot. `false` here is the interesting case — it is what the
// post-import-flip window actually looks like from inside the component.
const demoSnapshot = { DEMO: false };
vi.mock('@/api/demoClient', () => ({
  get DEMO() {
    return demoSnapshot.DEMO;
  },
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    btcAccount: { address: REAL_BTC_ADDRESS },
    solAccount: null,
    accounts: [],
  }),
}));

vi.mock('@/lib/txHistory', () => ({
  fetchAssetHistory: vi.fn(async ({ demo }) => ({
    supported: true,
    demo: !!demo,
    source: { networkName: 'Bitcoin Testnet', privacyNote: 'note' },
    transactions: [],
  })),
  explorerAddressUrl: () => 'https://example.invalid/',
}));

import FeeAnalytics from '../FeeAnalytics';
import { fetchAssetHistory } from '@/lib/txHistory';

const fetchMock = /** @type {any} */ (fetchAssetHistory);

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FeeAnalytics />
    </QueryClientProvider>
  );

beforeEach(() => {
  fetchMock.mockClear();
  deniability.session = false;
  deniability.orDemo = false;
  demoSnapshot.DEMO = false;
});

describe('FeeAnalytics — I3 egress invariant', () => {
  it('a deniability (decoy/hidden) session never queries history at all', async () => {
    deniability.session = true;
    deniability.orDemo = true;
    renderPage();
    // Give react-query a tick to do the thing it must not do.
    await waitFor(() => expect(screen.getByText('Fee Analytics')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST-IMPORT FLIP: demo set after module import must not leak the real address', async () => {
    // DEMO stays false (the snapshot already resolved), but the live helper sees
    // veyrnox-demo=1. This is the window the fix exists to close.
    demoSnapshot.DEMO = false;
    deniability.session = false;
    deniability.orDemo = true;

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    for (const call of fetchMock.mock.calls) {
      expect(call[0].address).toBeNull();
      expect(call[0].demo).toBe(true);
    }
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(REAL_BTC_ADDRESS);
  });

  it('an ordinary demo tour still renders sample fee data from the fixture path', async () => {
    demoSnapshot.DEMO = true;
    deniability.orDemo = true; // veyrnox-demo=1 is set, so the live helper agrees

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock.mock.calls[0][0]).toMatchObject({ address: null, demo: true });
    // The demo data-source disclosure proves the fixture path actually rendered.
    await screen.findByText(/computed from local sample data/i);
  });

  // The opposite failure to the post-import flip, and the one that is easy to
  // introduce while fixing it. isDeniabilityOrDemoActive() reads ONLY the
  // `veyrnox-demo` localStorage key -- it knows nothing about VITE_DEMO_MODE=1
  // builds or DEV+isNativePlatform() native-dev builds, both of which DEMO
  // resolves. A fix that drops DEMO and gates on the live helper alone therefore
  // sends the REAL address to the real indexer in a demo BUILD. The data-path
  // flag must be the union of both sources, which is why the DEMO import stays.
  it('DEMO BUILD: VITE_DEMO_MODE/native-dev demo must not leak, even with the live helper false', async () => {
    demoSnapshot.DEMO = true;
    deniability.session = false;
    deniability.orDemo = false; // no veyrnox-demo key — the live helper is blind here

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    for (const call of fetchMock.mock.calls) {
      expect(call[0].address).toBeNull();
      expect(call[0].demo).toBe(true);
    }
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(REAL_BTC_ADDRESS);
  });

  // I3 tell. The demo flag drives the header badge and the privacy note, so it
  // must be FALSE in a decoy/hidden session — otherwise a coerced session is
  // visually distinguishable from a real one, which is the whole thing
  // deniability exists to prevent.
  it('a deniability session does not render the demo badge', async () => {
    deniability.session = true;
    deniability.orDemo = true;

    renderPage();
    await waitFor(() => expect(screen.getByText('Fee Analytics')).toBeInTheDocument());

    expect(screen.queryByText(/Demo · sample data/i)).toBeNull();
  });

  it('NEGATIVE CONTROL: a real live session still sends the real address', async () => {
    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toMatchObject({
      address: REAL_BTC_ADDRESS,
      demo: false,
    });
  });
});
