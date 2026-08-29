import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', async () => {
  const wallet = /** @type {any} */ (await import('@/i18n/locales/en/wallet.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { wallet: wallet.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (typeof v !== 'string') return opts.defaultValue || key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return {
    useTranslation: (ns) => ({
      t: (k, o) => resolve(k, { ns, ...(o || {}) }),
      i18n: { language: 'en', resolvedLanguage: 'en' },
    }),
    Trans: ({ children }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }) => children,
  };
});

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/demoClient', () => ({
  DEMO: false,
}));

const useTierMock = vi.fn(() => ({
  currentTier: 'free',
  tiers: [],
  loading: false,
  refreshTier: vi.fn(),
}));
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => useTierMock(),
}));

describe('SecurityAdvisor', () => {
  let SecurityAdvisor;
  let isDeniabilityOrDemoActive;
  let resolveScreen;
  let getSuggestedQuestions;
  let buildPageSnapshotContext;
  let buildSuspiciousAssetsSnapshotGuidance;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    useTierMock.mockReturnValue({
      currentTier: 'free',
      tiers: [],
      loading: false,
      refreshTier: vi.fn(),
    });
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    const advisorModule = await import('../SecurityAdvisor.jsx');
    SecurityAdvisor = advisorModule.default;
    resolveScreen = advisorModule.resolveScreen;
    getSuggestedQuestions = advisorModule.getSuggestedQuestions;
    buildPageSnapshotContext = advisorModule.buildPageSnapshotContext;
    buildSuspiciousAssetsSnapshotGuidance = advisorModule.buildSuspiciousAssetsSnapshotGuidance;
  });

  it('renders FAB when not in deniability', () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /open vigil/i })).toBeDefined();
  });

  it('renders nothing in deniability mode (I3)', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const { container } = render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders FAB even without TIP configured (local knowledge fallback)', async () => {
    vi.stubEnv('VITE_TIP_BASE_URL', '');
    vi.resetModules();
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    SecurityAdvisor = (await import('../SecurityAdvisor.jsx')).default;
    render(
      <MemoryRouter initialEntries={['/']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /open vigil/i })).toBeDefined();
  });

  it('renders on dashboard route (app-wide)', () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /open vigil/i })).toBeDefined();
  });

  it('keeps the composer pinned while the message list is the scrolling region', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /open vigil/i }));

    const composer = await screen.findByPlaceholderText(/ask vigil anything/i);
    const form = composer.closest('form');
    const scrollingPane = document.querySelector('[class*="min-h-0"][class*="overflow-y-auto"]');

    expect(form?.className).toContain('sticky');
    expect(form?.className).toContain('bottom-0');
    expect(scrollingPane?.className).toContain('overflow-y-auto');
    expect(scrollingPane?.className).toContain('min-h-0');
  });

  it('does not crash when useTranslation returns no i18n handle', async () => {
    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({
        t: (k, o) => o?.defaultValue || k,
        i18n: undefined,
      }),
      Trans: ({ children }) => children,
      initReactI18next: { type: '3rdParty', init: () => {} },
      I18nextProvider: ({ children }) => children,
    }));
    vi.resetModules();
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    SecurityAdvisor = (await import('../SecurityAdvisor.jsx')).default;

    render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /open vigil/i })).toBeDefined();
  });

  it('maps representative deep routes to specific advisor screens', () => {
    expect(resolveScreen('/personal-backup')).toBe('personal_backup');
    expect(resolveScreen('/token-approvals')).toBe('token_approvals');
    expect(resolveScreen('/analytics')).toBe('analytics');
    expect(resolveScreen('/asset/eth')).toBe('asset_detail');
  });

  it('offers page-specific suggestions for recovery, approvals, analytics, and suspicious-asset review', () => {
    expect(getSuggestedQuestions('personal_backup')).toContain('How does personal backup work?');
    expect(getSuggestedQuestions('personal_backup')).toContain('Why are recovery shares disabled?');
    expect(getSuggestedQuestions('token_approvals')).toContain('How do I revoke a risky approval?');
    expect(getSuggestedQuestions('analytics')).toContain('What does this analytics page tell me?');
    expect(getSuggestedQuestions('suspicious_assets')).toContain('Which suspicious assets need my attention first?');
    expect(getSuggestedQuestions('suspicious_assets')).toContain('What is the difference between hidden spam and active review items?');
  });

  it('formats live page snapshot context for the remote advisor prompt', () => {
    const text = buildPageSnapshotContext({
      pathname: '/send',
      route_params: { asset: 'BTC' },
      wallet_session: { unlocked: true, mode: 'primary', wallet_count: 2 },
    });
    expect(text).toContain('Live page snapshot');
    expect(text).toContain('"pathname": "/send"');
    expect(text).toContain('"asset": "BTC"');
    expect(text).toContain('"wallet_count": 2');
  });

  it('summarizes suspicious-asset lanes for the remote advisor prompt', () => {
    const text = buildPageSnapshotContext({
      suspicious_token_total: 3,
      suspicious_nft_total: 1,
      hidden_suspicious_token_total: 1,
      dismissed_suspicious_nft_total: 2,
      risky_contract_total: 2,
      contract_intel_configured: true,
      contract_intel_opt_in: 'denied',
      suspicious_tokens: [
        { symbol: 'USDC', hidden: false },
        { symbol: 'FREE', hidden: true },
      ],
      suspicious_nfts: [
        { name: 'Claim Reward Pass' },
      ],
    }, 'suspicious_assets');

    expect(text).toContain('Suspicious-assets queue interpretation:');
    expect(text).toContain('Active review lane: 2 visible suspicious token(s) and 1 suspicious collectible(s) still shown in the queue.');
    expect(text).toContain('Hidden spam lane: 1 suspicious token(s) are hidden elsewhere by user choice');
    expect(text).toContain('Deferred collectible lane: 2 suspicious collectible(s) were dismissed from this queue by user choice');
    expect(text).toContain('configured but still off because the user has not opted in');
    expect(text).toContain('Visible token examples: USDC.');
    expect(text).toContain('Hidden token examples: FREE.');
  });

  it('can build suspicious-asset guidance directly', () => {
    const text = buildSuspiciousAssetsSnapshotGuidance({
      suspicious_token_total: 1,
      suspicious_nft_total: 0,
      hidden_suspicious_token_total: 0,
      dismissed_suspicious_nft_total: 0,
      risky_contract_total: 1,
      contract_intel_configured: false,
    });

    expect(text).toContain('Contract-review lane: 1 token(s) have contract-risk hints');
    expect(text).toContain('not configured in this build, so only local evidence is available');
  });
});
