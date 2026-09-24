// Lock-suppression across the Transak hand-off (owner ruling 2026-09-23:
// "no interruption in the BUY flow, no PIN, no FaceID").
//
// WHY THIS EXISTS. BuyCrypto opens Transak in SFSafariViewController /
// Chrome Custom Tabs (BuyCrypto.jsx — Transak's T-INF-103 WAF rule makes the
// in-app iframe path unusable on mobile). That backgrounds the Capacitor
// WebView, which fires the appStateChange lock hook. The configured relock
// grace defaults to 0 (lib/relockGrace.js: nothing stored → 0 → lock now), so
// the wallet locked the instant Transak opened and the user came back to an
// 8-digit PIN prompt — mid-purchase.
//
// The app already has the mechanism for a deliberate OS hand-off that
// backgrounds us: withLockSuppressed, used by the Face ID sheet
// (WalletProvider), the file picker (RestoreFromFile) and passkey enrolment
// (PasskeySetup). Buy never called it. These tests pin that it does, and —
// more importantly — that the window it opens always CLOSES.
//
// The second property is the security-relevant one. Suppression that never
// ends is a wallet that never locks, which is strictly worse than the PIN
// prompt it replaced. So the window is bounded twice: by browserFinished, and
// by a hard timeout if that event never arrives (app killed, event dropped).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Select primitive calls window.matchMedia on mount; jsdom has no
// implementation. Without this the render throws and every assertion below
// fails for a reason that has nothing to do with locking.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = /** @type {any} */ (() => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, o) => (o && o.defaultValue) || k }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}));

const browserOpen = vi.fn(async (/** @type {any} */ _opts) => {});
const listenerRemove = vi.fn();
const walletLock = vi.fn();
/** @type {null | (() => void)} */
let finishedHandler = null;

vi.mock('@capacitor/browser', () => ({
  Browser: {
    // Lazy reference: vi.mock factories are hoisted, so naming browserOpen
    // directly here throws 'Cannot access before initialization'.
    open: (/** @type {any} */ opts) => browserOpen(opts),
    addListener: vi.fn(async (event, cb) => {
      if (event === 'browserFinished') finishedHandler = cb;
      return { remove: listenerRemove };
    }),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@/api/edgeApi', () => ({
  createBuySession: vi.fn(async () => ({ url: 'https://global.transak.com/?x=1' })),
}));

// withLockSuppressed with the REAL depth semantics of
// wallet-core/keystore/native.js: a counter that is only decremented when the
// wrapped promise settles. `depth > 0` is exactly "the lock hook is muted".
let depth = 0;
const withLockSuppressed = vi.fn(async (fn) => {
  depth++;
  try {
    return await fn();
  } finally {
    depth--;
  }
});

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    accounts: [{ address: '0xabc' }],
    btcAccount: null,
    solAccount: null,
    withBuyLockSuppressed: withLockSuppressed,
    lock: walletLock,
  }),
}));

vi.mock('@/lib/receiveAddress', () => ({
  resolveReceive: () => ({ address: '0xabc' }),
}));
vi.mock('@/lib/buy/useBuyEnabled', () => ({ useBuyEnabled: () => true }));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
  DENIABILITY_SESSION_CHANGED_EVENT: 'x',
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: () => ({}) }));

import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import BuyCrypto from '../BuyCrypto.jsx';
import { Browser } from '@capacitor/browser';
import { createBuySession } from '@/api/edgeApi';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function startBuy() {
  render(
    <MemoryRouter>
      <BuyCrypto />
    </MemoryRouter>,
  );
  const btn = await screen.findByRole('button', { name: /buy|continue/i });
  btn.click();
  await waitFor(() => expect(browserOpen).toHaveBeenCalled());
}

describe('BuyCrypto — the Transak hand-off does not relock the wallet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    depth = 0;
    finishedHandler = null;
    browserOpen.mockReset();
    walletLock.mockClear();
    listenerRemove.mockClear();
    withLockSuppressed.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // Mutation check: delete the withLockSuppressed wrapper in BuyCrypto.jsx and
  // call Browser.open directly → red here.
  it('suppresses the lock hook while Transak is open', async () => {
    await startBuy();
    expect(withLockSuppressed).toHaveBeenCalled();
    expect(depth).toBeGreaterThan(0);
  });

  // Mutation check: stop calling the resolver in the browserFinished handler
  // → red here (depth never returns to 0).
  it('releases suppression when the browser closes', async () => {
    await startBuy();
    expect(depth).toBeGreaterThan(0);

    const fire = finishedHandler;
    expect(fire, 'a browserFinished listener must be registered').toBeTypeOf('function');
    if (fire) fire();
    await flush();

    expect(depth).toBe(0);
    expect(listenerRemove).toHaveBeenCalled();
    expect(walletLock).not.toHaveBeenCalled();
  });

  // The fail-closed half. Mutation check: remove the setTimeout bound in
  // BuyCrypto.jsx → red here, and in production the wallet would stay unlocked
  // indefinitely whenever browserFinished is dropped.
  it('releases suppression on its own if browserFinished never fires', async () => {
    await startBuy();
    expect(depth).toBeGreaterThan(0);

    // Well past any plausible bound; the point is that SOME bound exists.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await flush();

    expect(
      depth,
      'an unbounded suppression window is a wallet that never locks — worse '
        + 'than the PIN prompt this replaced',
    ).toBe(0);
    expect(walletLock).toHaveBeenCalledTimes(1);
  });

  // Mutation check: resolve the suppression promise before Browser.open →
  // red here.
  it('opens the browser inside the suppression window, not before it', async () => {
    await startBuy();
    const suppressOrder = withLockSuppressed.mock.invocationCallOrder[0];
    const openOrder = browserOpen.mock.invocationCallOrder[0];
    expect(suppressOrder).toBeLessThan(openOrder);
  });
  it('does not open the browser if the wallet locked during session creation', async () => {
    withLockSuppressed.mockRejectedValueOnce(new Error('WALLET_LOCKED'));
    render(<MemoryRouter><BuyCrypto /></MemoryRouter>);
    screen.getByRole('button', { name: /buy|continue/i }).click();
    await screen.findByRole('alert');
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('does not open without the browser close listener', async () => {
    vi.mocked(Browser.addListener).mockRejectedValueOnce(new Error('listener unavailable'));
    render(<MemoryRouter><BuyCrypto /></MemoryRouter>);
    screen.getByRole('button', { name: /buy|continue/i }).click();
    await screen.findByRole('alert');
    expect(browserOpen).not.toHaveBeenCalled();
    expect(depth).toBe(0);
  });

  it('releases suppression when the page unmounts', async () => {
    await startBuy();
    cleanup();
    await flush();
    expect(depth).toBe(0);
    expect(listenerRemove).toHaveBeenCalled();
    expect(walletLock).not.toHaveBeenCalled();
  });

  it('does not launch a late session after leaving the Buy page', async () => {
    let resolve;
    vi.mocked(createBuySession).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(<MemoryRouter><BuyCrypto /></MemoryRouter>);
    screen.getByRole('button', { name: /buy|continue/i }).click();
    cleanup();
    resolve({ url: 'https://global.transak.com/?x=1' });
    await flush();
    expect(browserOpen).not.toHaveBeenCalled();
    expect(depth).toBe(0);
  });
});
