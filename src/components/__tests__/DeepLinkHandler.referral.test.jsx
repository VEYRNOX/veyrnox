// DeepLinkHandler — referral share links as universal/app links (#2527).
//
// A phone user who taps https://veyrnox.com/r/VYX-XXXXXX with the app installed
// never sees the redirect; the OS hands the URL to the app. These pins say the
// handler turns that into a pending referral, on cold start (launch URL) and
// warm (appUrlOpen), and leaves every other link on its existing path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const captureReferralFromUrl = vi.fn();
vi.mock('@/lib/referralAttribution', () => ({
  captureReferralFromUrl: (...a) => captureReferralFromUrl(...a),
}));

const setPendingWcUri = vi.fn();
vi.mock('@/lib/deepLinkPairing', () => ({
  extractWcUri: (raw) => (raw.includes('/wc') ? 'wc:abc@2?relay-protocol=irn&symKey=00' : null),
  setPendingWcUri: (...a) => setPendingWcUri(...a),
}));
vi.mock('@/lib/buy/useBuyEnabled', () => ({ isBuyEnabled: () => false }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: () => false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

let launchUrl = null;
let warmListener = null;
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: () => Promise.resolve(launchUrl ? { url: launchUrl } : null),
    addListener: (_evt, cb) => { warmListener = cb; return Promise.resolve({ remove: vi.fn() }); },
  },
}));

const navigate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

const DeepLinkHandler = (await import('../DeepLinkHandler')).default;

function mount() {
  return render(<MemoryRouter><DeepLinkHandler /></MemoryRouter>);
}

describe('DeepLinkHandler — /r/<code> referral links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchUrl = null;
    warmListener = null;
  });

  it('cold start: a launch URL of /r/<code> is captured as a universal-link referral', async () => {
    launchUrl = 'https://veyrnox.com/r/VYX-STRKLB';
    mount();
    await waitFor(() => expect(captureReferralFromUrl).toHaveBeenCalledTimes(1));
    const [url, source] = captureReferralFromUrl.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect(url.href).toBe('https://veyrnox.com/r/VYX-STRKLB');
    expect(source).toBe('universal_link');
    // The referral is stored, not navigated to — and never treated as a pairing.
    expect(navigate).not.toHaveBeenCalled();
    expect(setPendingWcUri).not.toHaveBeenCalled();
  });

  it('warm: an appUrlOpen of /r/<code> is captured the same way', async () => {
    mount();
    await waitFor(() => expect(warmListener).toBeTypeOf('function'));
    warmListener({ url: 'https://veyrnox.com/r/vyx-strklb' });
    expect(captureReferralFromUrl).toHaveBeenCalledTimes(1);
    expect(captureReferralFromUrl.mock.calls[0][0].pathname).toBe('/r/vyx-strklb');
    expect(captureReferralFromUrl.mock.calls[0][1]).toBe('universal_link');
  });

  it('hands validation to captureReferralFromUrl rather than pre-filtering the path', async () => {
    // A bad code still reaches the capture function, which is where CODE_RE and
    // the I3 gate live — one place, not two.
    launchUrl = 'https://veyrnox.com/r/not-a-code';
    mount();
    await waitFor(() => expect(captureReferralFromUrl).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves WalletConnect links on the pairing path', async () => {
    launchUrl = 'https://veyrnox.com/wc?uri=wc%3Aabc';
    mount();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/walletconnect'));
    expect(captureReferralFromUrl).not.toHaveBeenCalled();
  });

  it('ignores /r/ on a host the association files do not claim', async () => {
    launchUrl = 'https://evil.example/r/VYX-STRKLB';
    mount();
    // Let the launch-URL promise settle, then assert nothing was captured.
    await new Promise((r) => setTimeout(r, 0));
    expect(captureReferralFromUrl).not.toHaveBeenCalled();
  });
});
