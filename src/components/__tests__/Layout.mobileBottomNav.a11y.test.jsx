// @ts-nocheck
// src/components/__tests__/Layout.mobileBottomNav.a11y.test.jsx
//
// A-1: the mobile bottom-nav buttons (Home / Send / Receive) carried
// role="tab" + aria-selected + roving tabIndex={active ? 0 : -1} with NO
// arrow-key handler anywhere in the file — roving tabindex without arrow-key
// re-homing is a keyboard trap: the two inactive items got tabindex="-1" and
// could never receive focus via sequential Tab navigation, so a keyboard-only
// user could not reach Send or Receive at all. The tab-panel elements'
// role="tabpanel" + aria-labelledby="tab-N" were also orphaned (no element
// carried id="tab-N").
//
// THE FIX (see Layout.jsx): these are route-changing navigation entries, not
// an ARIA tabs widget rendering different views of ONE page — clicking Send
// calls navigate('/send'), a real route change. The honest fix is to drop the
// tabs pattern rather than bolt on arrow-key roving onto something that isn't
// a tab set: role="tab"/aria-selected/aria-controls/tabIndex and
// role="tabpanel"/aria-labelledby are removed. Every button is now a plain,
// natively-focusable <button> with NO tabIndex override at all — it
// participates in normal sequential Tab order like every other control — and
// aria-current="page" marks the active destination (the same pattern already
// used by every <Link> elsewhere in this file).
//
// These tests render the REAL Layout and inspect the REAL, browser-computed
// `tabIndex` IDL property (not a source-string grep) to prove reachability,
// and fire real click events to prove activation. Note on scope: this repo
// has no @testing-library/user-event dependency (confirmed absent from
// node_modules and package.json), so real sequential-Tab simulation isn't
// available here; jsdom also does not synthesize a click from an Enter/Space
// keydown on a native <button> (verified directly — fireEvent.keyDown does
// NOT invoke onClick), so a keydown-based "activation" assertion would be
// theatre. The load-bearing checks below are (a) `tabIndex !== -1` on every
// nav button — the literal DOM property a browser's focus-navigation
// algorithm reads, and exactly what the old `tabIndex={active ? 0 : -1}` code
// set to -1 on the two inactive items — and (b) that clicking the resulting
// focusable target actually navigates, i.e. it is a real activatable control
// and not a decoy. For a native, unmodified <button>, the browser guarantees
// Enter/Space triggers the same click — that translation is native HTML
// semantics, not application code, so it needs no separate re-test here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../Layout.jsx';

// jsdom does not implement matchMedia. Force the mobile branch (isDesktop
// false) so the bottom nav actually renders — mirrors the existing pattern in
// Calculator.deniability.test.jsx.
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

// Minimal, inert wallet context: isUnlocked:false short-circuits every
// balance/notification-polling effect Layout mounts (usePriceAlertNotifier,
// useReceiveDetector), so this test exercises real nav markup without pulling
// in live balance/RPC machinery that has nothing to do with A-1.
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

// FeatureGate (wrapping every tab panel) reads useTier(); stub it to 'free' so
// FeatureGate's real gating logic still runs, just against a fixed tier
// instead of the real RevenueCat resolution path (out of scope here).
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'free', loading: false }),
}));

// The three mobile root-tab panels lazy-load the REAL page components, which
// pull in send/receive-flow logic far outside this file's ownership. Stub them
// to trivial, uniquely-labelled markers so the test can assert WHICH panel is
// visible without mounting SendCrypto/ReceiveCrypto/Dashboard.
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

afterEach(() => cleanup());

describe('Layout — mobile bottom nav is keyboard-reachable (A-1)', () => {
  it('renders Home, Send, Receive as plain buttons with NO tab/tabpanel ARIA roles', async () => {
    renderLayout('/');
    // role="tab" no longer exists anywhere in the bottom nav.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryAllByRole('tabpanel')).toHaveLength(0);
    // The three destinations are ordinary, accessible-by-name buttons.
    expect(await screen.findByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
  });

  it('every bottom-nav button is in the real sequential Tab order (tabIndex !== -1)', async () => {
    renderLayout('/');
    const nav = await screen.findByRole('navigation', { name: 'Bottom navigation' });
    const buttons = within(nav).getAllByRole('button');
    // Home, Send, Receive, More — all four. Before the fix, whichever of
    // Home/Send/Receive was NOT the active route had tabIndex === -1 (the
    // browser's own focus-navigation algorithm reads this exact IDL property
    // to decide sequential-Tab eligibility — this is not a source scan).
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const btn of buttons) {
      expect(btn.tabIndex).not.toBe(-1);
      expect(btn.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('the currently-inactive destinations (Send, Receive on Home) are still in tab order — the exact prior bug', async () => {
    renderLayout('/'); // Home is active; Send/Receive are the "inactive" tabs that used to be unreachable.
    const send = await screen.findByRole('button', { name: 'Send' });
    const receive = screen.getByRole('button', { name: 'Receive' });
    expect(send.tabIndex).toBe(0);
    expect(receive.tabIndex).toBe(0);
  });

  it('Send is activatable once focused (native <button> — Enter/Space triggers the same click natively)', async () => {
    renderLayout('/');
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send.tagName).toBe('BUTTON'); // native semantics apply — no custom role.
    send.focus();
    expect(send).toHaveFocus();
    fireEvent.click(send);
    expect(screen.getByText('SEND_PANEL')).toBeVisible();
  });

  it('Receive is activatable once focused', async () => {
    renderLayout('/');
    const receive = await screen.findByRole('button', { name: 'Receive' });
    receive.focus();
    fireEvent.click(receive);
    expect(screen.getByText('RECEIVE_PANEL')).toBeVisible();
  });

  it('marks the active destination with aria-current="page" (not aria-selected)', async () => {
    renderLayout('/send');
    const send = await screen.findByRole('button', { name: 'Send' });
    const home = screen.getByRole('button', { name: 'Home' });
    expect(send).toHaveAttribute('aria-current', 'page');
    expect(home).not.toHaveAttribute('aria-current');
    // aria-selected was the tabs-widget attribute this replaces; it must be gone.
    expect(send).not.toHaveAttribute('aria-selected');
  });
});
