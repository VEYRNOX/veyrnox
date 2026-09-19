// @ts-nocheck
// Nav group collapse (#2609 item 1).
//
// The More drawer rendered all 10 groups expanded — 67 equal-weight
// destinations in one scroll on a phone. Groups now collapse, and a group with
// no explicit user toggle defaults to open IFF it holds the current route, so
// the drawer opens on where you are.
//
// Rendered against the real Layout rather than scanning the source, because
// the thing that broke before was the DEFAULT — a fixed seed of
// {Overview, Wallet} looks identical in source to a route-derived one and
// behaves differently on every route but two.

import { describe, it, expect, vi, afterEach } from 'vitest';

// react-i18next 15 uses its own React copy under node_modules/react-i18next/
// node_modules/react — useContext returns null there. Mock useTranslation
// with a JSON-catalog resolver (same shape as the DuressPin tests).
vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const security = /** @type {any} */ (await import('@/i18n/locales/en/security.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { wallet: wallet.default, security: security.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (opts.returnObjects) return v ?? [];
    if (typeof v !== 'string') return key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return {
    useTranslation: (ns) => ({ t: (k, o) => resolve(k, { ns, ...(o || {}) }) }),
    Trans: ({ children }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }) => children,
  };
});

import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../Layout.jsx';

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: false,
    isDecoy: false,
    isHidden: false,
    wallets: [],
    activeWalletId: null,
    accounts: [],
    btcAccount: null,
    solAccount: null,
    lock: vi.fn(),
  }),
}));

vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'free', loading: false }),
}));

vi.mock('../../pages/Dashboard', () => ({ default: () => <div>DASHBOARD_PANEL</div> }));
vi.mock('../../pages/SendCrypto', () => ({ default: () => <div>SEND_PANEL</div> }));
vi.mock('../../pages/ReceiveCrypto', () => ({ default: () => <div>RECEIVE_PANEL</div> }));

function renderLayout(initialPath = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Layout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function openDrawer() {
  const opener = screen.getByRole('button', { name: 'More features' });
  fireEvent.click(opener);
}

afterEach(() => cleanup());

// The desktop sidebar renders the same groups in the same tree under jsdom, and
// the "More features" opener is itself an aria-expanded button — so every query
// here is scoped to the drawer's dialog. Querying the whole document instead
// returned 3 "expanded" buttons on the first run of this test.
function drawerGroupHeaders() {
  const dialog = screen.getByRole('dialog');
  return within(dialog).getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
}

describe('Layout — nav groups collapse in the More drawer (#2609)', () => {
  it('opens with only the group holding the current route expanded', async () => {
    renderLayout('/tx-history');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const headers = drawerGroupHeaders();
    const expanded = headers.filter((b) => b.getAttribute('aria-expanded') === 'true');
    expect(headers.length).toBeGreaterThan(5); // all 10 groups have a header
    expect(expanded.length).toBe(1);
    // and it is the group that actually contains /tx-history
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('link').some((a) => a.getAttribute('href') === '/tx-history')).toBe(true);
  });

  it('a collapsed group does not render its destinations at all', async () => {
    renderLayout('/tx-history');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const dialog = screen.getByRole('dialog');
    const linksWhileCollapsed = within(dialog).getAllByRole('link').length;
    // Expand everything; the link count must rise, proving the collapsed
    // groups were absent from the tree rather than merely visually hidden.
    for (const b of drawerGroupHeaders()) {
      if (b.getAttribute('aria-expanded') === 'false') fireEvent.click(b);
    }
    expect(within(dialog).getAllByRole('link').length).toBeGreaterThan(linksWhileCollapsed);
  });

  it('the route-derived open group collapses on the FIRST tap', async () => {
    // The dead-tap case. An untouched group has no entry in the override map,
    // so a toggle written as `!prev[label]` reads undefined as closed and sets
    // it to open — on the one group that is already open on screen. Nothing
    // moves. Every other test here passes with that bug, because they all act
    // on collapsed headers where !undefined happens to be right.
    renderLayout('/tx-history');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const open = drawerGroupHeaders().find((b) => b.getAttribute('aria-expanded') === 'true');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'false');
  });

  it('a group header toggles on click', async () => {
    renderLayout('/tx-history');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const closed = drawerGroupHeaders().find((b) => b.getAttribute('aria-expanded') === 'false');
    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-expanded', 'false');
  });
});
