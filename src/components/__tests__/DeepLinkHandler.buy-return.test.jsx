// Tests for the /buy/return deep-link routing added in Task 8.
// Simulates appUrlOpen events (warm-start, already running) and
// getLaunchUrl (cold-start). Does NOT test WalletConnect routing — that
// is covered by the existing pairing-link tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ── mocks set up before any import of the module under test ────────────────

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));

let appUrlOpenCallback = null;
let mockLaunchUrl = null;

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: () => Promise.resolve(mockLaunchUrl ? { url: mockLaunchUrl } : null),
    addListener: vi.fn((event, cb) => {
      if (event === 'appUrlOpen') appUrlOpenCallback = cb;
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@/lib/deepLinkPairing', () => ({
  extractWcUri: (url) => (url.startsWith('wc:') ? url : null),
  setPendingWcUri: vi.fn(),
}));

// ── helpers ────────────────────────────────────────────────────────────────

async function renderHandler() {
  const { default: DeepLinkHandler } = await import('../DeepLinkHandler.jsx');
  render(<DeepLinkHandler />);
  // Flush microtasks so getLaunchUrl promise resolves
  await new Promise((r) => setTimeout(r, 0));
}

function fireUrlOpen(url) {
  if (!appUrlOpenCallback) throw new Error('appUrlOpen listener not registered');
  appUrlOpenCallback({ url });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('DeepLinkHandler — /buy/return routing', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNavigate.mockReset();
    appUrlOpenCallback = null;
    mockLaunchUrl = null;
  });

  it('routes to /buy/in-progress when URL path is /buy/return (no tid)', async () => {
    await renderHandler();
    fireUrlOpen('https://veyrnox.com/buy/return');
    expect(mockNavigate).toHaveBeenCalledWith('/buy/in-progress');
  });

  it('routes to /buy/in-progress?tid=... when tid param is present', async () => {
    await renderHandler();
    fireUrlOpen('https://veyrnox.com/buy/return?tid=mp_txn_abc123');
    expect(mockNavigate).toHaveBeenCalledWith('/buy/in-progress?tid=mp_txn_abc123');
  });

  it('encodes a tid that requires percent-encoding', async () => {
    await renderHandler();
    fireUrlOpen('https://veyrnox.com/buy/return?tid=a%20b%26c');
    // searchParams.get decodes; encodeURIComponent re-encodes
    expect(mockNavigate).toHaveBeenCalledWith('/buy/in-progress?tid=a%20b%26c');
  });

  it('does NOT navigate for a non-buy, non-WC URL', async () => {
    await renderHandler();
    fireUrlOpen('https://veyrnox.com/settings');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('still routes WC pairing links as before', async () => {
    await renderHandler();
    const { setPendingWcUri } = await import('@/lib/deepLinkPairing');
    const wcUri = 'wc:abc123@2?relay-protocol=irn&symKey=xyz';
    fireUrlOpen(wcUri);
    expect(setPendingWcUri).toHaveBeenCalledWith(wcUri);
    expect(mockNavigate).toHaveBeenCalledWith('/walletconnect');
  });

  it('does not crash on a malformed URL and falls through gracefully', async () => {
    await renderHandler();
    // not a valid URL, not a WC URI — no navigation
    expect(() => fireUrlOpen('not a url at all')).not.toThrow();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('cold-start: routes /buy/return from getLaunchUrl with tid', async () => {
    mockLaunchUrl = 'https://veyrnox.com/buy/return?tid=cold123';
    await renderHandler();
    expect(mockNavigate).toHaveBeenCalledWith('/buy/in-progress?tid=cold123');
  });
});
