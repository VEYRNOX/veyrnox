// @ts-nocheck
// src/components/__tests__/Layout.moreDrawer.a11y.test.jsx
//
// A-2: the More-drawer close button (`<button onClick={...}><X /></button>`)
// had no aria-label, no visible text, and the lucide <X> icon renders a bare
// <svg> with no accessible name — a screen reader announced only "button".
// Every other icon-only control in this file (Search, Settings, Lock, More
// features) IS labelled; this was an oversight. Fixed with aria-label="Close"
// + aria-hidden="true" on the decorative icon.
//
// The drawer is also a full-screen modal overlay with no role="dialog", no
// aria-modal, and no Escape-to-close. Fixed: role="dialog" + aria-modal="true"
// + aria-labelledby pointing at the visible "All Features" heading, a
// window-level Escape listener (only registered while open), and initial
// focus moved to the close button when the drawer opens.
//
// NOT done, on purpose (documented, not silently skipped): a full focus trap.
// The task explicitly says a broken trap is worse than none, and a correct
// trap needs careful first/last-focusable-element bookkeeping across a drawer
// whose content (nav groups + conditional Recent tiles) is dynamic — more
// surface than can be verified here. Tab can still leave the drawer into the
// page behind it. This is a real, honest residual gap (repeated in the final
// report), not swept under the rug.
//
// Note on tooling: this repo has no @testing-library/user-event dependency
// (confirmed absent from node_modules/package.json), so these use
// @testing-library/react's `fireEvent` — real DOM events against the real
// rendered Layout, not source-string assertions.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('Layout — More-drawer close button has an accessible name (A-2)', () => {
  it('is queryable by role + accessible name "Close"', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('the decorative X icon is hidden from the accessibility tree', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    const svg = closeBtn.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('clicking it closes the drawer', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Layout — More-drawer is exposed as a modal dialog (A-2)', () => {
  it('carries role="dialog"', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  // Codex review (P2): aria-modal="true" without focus containment is ACTIVELY
  // MISLEADING — it tells assistive tech the rest of the app is inert while Tab
  // can still walk into the page behind the drawer. This drawer deliberately has
  // no focus trap, so it must not claim modality (I4: never assert a property we
  // do not have). This pins the absence so the attribute cannot be reinstated
  // without real focus containment landing first.
  it('does NOT claim aria-modal, because it does not trap focus', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('dialog').hasAttribute('aria-modal')).toBe(false);
  });

  it('is labelled by the visible "All Features" heading (aria-labelledby, not a duplicate string)', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    const dialog = screen.getByRole('dialog');
    const labelledbyId = dialog.getAttribute('aria-labelledby');
    expect(labelledbyId).toBeTruthy();
    const label = document.getElementById(labelledbyId);
    expect(label).toHaveTextContent('All Features');
    // The dialog's accessible name resolves through aria-labelledby.
    expect(dialog).toHaveAccessibleName('All Features');
  });

  it('is not present before the drawer is opened', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Layout — Escape closes the More drawer (A-2)', () => {
  it('closes on Escape while the drawer is open', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape before the drawer is open is a no-op (does not throw, no dialog appears)', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves focus onto the close button when the drawer opens', async () => {
    renderLayout('/');
    await screen.findByRole('button', { name: 'More features' });
    openDrawer();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});
