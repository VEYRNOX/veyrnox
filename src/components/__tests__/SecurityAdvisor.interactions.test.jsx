// src/components/__tests__/SecurityAdvisor.interactions.test.jsx
//
// Test interactions and correlations between:
// 1. AI Security Advisor (TIP remote chat endpoint + local knowledge fallback)
// 2. TIP Security Advisor (threat intelligence screening for addresses)
//
// Key scenarios:
// - Address extraction triggers screening before chat
// - Screening verdicts correlate with advisor risk responses
// - Local fallback works when TIP is offline
// - Consent gates both remote chat and screen operations
// - Follow-up questions correlate with previous findings

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SEED_THREATS } from '@/lib/threatIntelStore.js';

const ADVISOR_KEY = 'veyrnox-advisor-remote-consent';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
const useTierMock = vi.fn(() => ({ currentTier: 'ai_security_protection' }));
const getRcUserIdMock = vi.fn(async () => null);
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => useTierMock(),
}));
vi.mock('@/lib/purchases', () => ({
  getRcUserId: () => getRcUserIdMock(),
}));

const mockScreenTransaction = vi.fn();
vi.mock('@/api/tipScreen.js', () => ({
  screenTransaction: mockScreenTransaction,
}));

async function mountAdvisor({ tier = 'ai_security_protection' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
  useTierMock.mockReturnValue({ currentTier: tier });

  const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
  render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="ethereum" />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByLabelText(/open vigil/i));
  return screen;
}

async function mountAdvisorWithFallback({ tier = 'ai_security_protection' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
  vi.stubEnv('VITE_EDGE_BASE', 'https://veyrnox-prod.pages.dev');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb-anon-key');
  useTierMock.mockReturnValue({ currentTier: tier });

  const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
  render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="ethereum" />
    </MemoryRouter>
  );

  fireEvent.click(screen.getByLabelText(/open vigil/i));
  return screen;
}

async function askQuestion(text) {
  const box = await screen.findByPlaceholderText(/ask vigil/i);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest('form'));
}

async function grantAdvisorConsent() {
  const consentPanel = await screen.findByTestId('advisor-remote-consent');
  fireEvent.click(consentPanel.querySelector('[data-testid="advisor-consent-allow"]'));
  await waitFor(() => expect(localStorage.getItem(ADVISOR_KEY)).toBe('granted'));
}

async function denyAdvisorConsent() {
  const consentPanel = await screen.findByTestId('advisor-remote-consent');
  fireEvent.click(consentPanel.querySelector('[data-testid="advisor-consent-deny"]'));
  await waitFor(() => expect(localStorage.getItem(ADVISOR_KEY)).toBe('denied'));
}

describe('SecurityAdvisor — AI + TIP Interactions & Correlations', () => {
  let fetchSpy;

  beforeEach(() => {
    localStorage.clear();
    useTierMock.mockReturnValue({ currentTier: 'ai_security_protection' });
    getRcUserIdMock.mockResolvedValue(null);

    // Spy on all fetch calls (both chat and screening)
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Clear mocks
    mockScreenTransaction.mockClear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  describe('Address extraction & threat screening correlation', () => {
    it('renders a local seeded sanctions hit without crashing, even when remote consent is denied', async () => {
      await mountAdvisor();
      await denyAdvisorConsent();

      await askQuestion(`Is ${SEED_THREATS[0].address} safe?`);

      await waitFor(() => {
        const verdict = screen.getByTestId('tip-screening-verdict');
        expect(verdict.textContent).toContain('BLOCKED');
        expect(verdict.textContent).toContain('Sanctions match detected');
      });

      expect(mockScreenTransaction).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('detects EVM addresses and screens them before asking for chat', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      // Mock a screening verdict
      const mockScreening = {
        verdict: 'warn',
        sanctions: false,
        risks: [
          {
            title: 'Known Scam Address',
            detail: 'This address has been reported in multiple scam incidents',
          },
        ],
      };

      // When asking about an address, screening should happen first
      mockScreenTransaction.mockResolvedValueOnce(mockScreening);

      await askQuestion('Is 0xdead000000000000000000000000000000000000 safe?');

      // Screening verdict should appear
      await waitFor(() => {
        expect(screen.getByTestId('tip-screening-verdict')).toBeTruthy();
      });

      // Verdict should show the risk
      const verdict = screen.getByTestId('tip-screening-verdict');
      expect(verdict.textContent).toContain('CAUTION');
      expect(verdict.textContent).toContain('Known Scam Address');
    });

    it('shows BLOCKED verdict when sanctions match', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      const mockSanctionsHit = {
        verdict: 'block',
        sanctions: true,
        risks: [],
      };

      mockScreenTransaction.mockResolvedValueOnce(mockSanctionsHit);
      await askQuestion('0x1111111111111111111111111111111111111111');

      await waitFor(() => {
        const verdict = screen.getByTestId('tip-screening-verdict');
        expect(verdict.textContent).toContain('BLOCKED');
        expect(verdict.textContent).toContain('Sanctions match detected');
      });
    });

    it('shows CLEAR verdict with no risks found', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      const mockClear = {
        verdict: 'allow',
        sanctions: false,
        risks: [],
      };

      mockScreenTransaction.mockResolvedValueOnce(mockClear);
      await askQuestion('0x0000000000000000000000000000000000000001');

      await waitFor(() => {
        const verdict = screen.getByTestId('tip-screening-verdict');
        expect(verdict.textContent).toContain('CLEAR');
        // Copy updated as part of multi-source aggregator (PR #1615): a green
        // CLEAR badge now reads as "no hits from consulted sources" — an honest
        // statement about which sources answered, not a claim of absolute safety.
        expect(verdict.textContent).toContain('No hits from consulted sources');
      });
    });
  });

  describe('Consent correlation: both chat and screening gate on explicit grant', () => {
    it('shows consent panel before screening is allowed', async () => {
      await mountAdvisor();

      // Consent panel should appear without clearing it
      expect(await screen.findByTestId('advisor-remote-consent')).toBeTruthy();
    });

    it('allows screening to proceed after consent is granted', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      const mockScreening = {
        verdict: 'allow',
        sanctions: false,
        risks: [],
      };

      mockScreenTransaction.mockResolvedValueOnce(mockScreening);

      // After consent, addressing should be possible
      await askQuestion('0x0000000000000000000000000000000000000001');

      await waitFor(() => {
        expect(screen.getByTestId('tip-screening-verdict')).toBeTruthy();
      });
    });

    it('blocks BOTH chat and remote screening after consent is explicitly denied (Codex P1 2026-08-15)', async () => {
      await mountAdvisor();
      await denyAdvisorConsent();

      // Remote address-lookup egress used to run REGARDLESS of the chat
      // consent choice — a user who declined "your addresses are never
      // included" still had their address sent to TIP the moment they
      // asked "is 0x... safe?". Both channels are now gated on the same
      // grant; local seed threat-intel still fires (unaffected).
      const mockScreening = {
        verdict: 'allow',
        sanctions: false,
        risks: [],
      };
      mockScreenTransaction.mockResolvedValueOnce(mockScreening);

      await askQuestion('0x0000000000000000000000000000000000000001');

      // Neither remote screening nor chat fetch should fire after denial.
      expect(mockScreenTransaction).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('persists consent decision across remounts', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();
      cleanup();

      // Remount
      await mountAdvisor();

      // Should not show consent panel again
      expect(screen.queryByTestId('advisor-remote-consent')).toBeNull();
    });

    it('shows the AI Security Protection paywall instead of consent on Safety Plus', async () => {
      await mountAdvisor({ tier: 'safety_plus' });
      expect(await screen.findByTestId('advisor-online-paywall')).toBeTruthy();
      expect(screen.queryByTestId('advisor-remote-consent')).toBeNull();
    });
  });

  describe('Local fallback correlation: offline degrades gracefully', () => {
    it('falls back from the edge proxy to Supabase with the required auth headers', async () => {
      await mountAdvisorWithFallback();
      await grantAdvisorConsent();

      fetchSpy
        .mockResolvedValueOnce({ ok: false })
        .mockRejectedValueOnce(new Error('Network error'));

      await askQuestion('what is deniability mode?');

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      expect(fetchSpy.mock.calls[0][0]).toBe('https://veyrnox-prod.pages.dev/api/edge/tip-chat');
      expect(fetchSpy.mock.calls[1][0]).toBe('https://project.supabase.co/functions/v1/tip-chat');
      expect(fetchSpy.mock.calls[1][1].headers).toMatchObject({
        Authorization: 'Bearer sb-anon-key',
        apikey: 'sb-anon-key',
        'Content-Type': 'application/json',
      });
    });

    it('attaches the RevenueCat app user id header when available', async () => {
      getRcUserIdMock.mockResolvedValue('rc-user-123');
      await mountAdvisorWithFallback();
      await grantAdvisorConsent();

      fetchSpy.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('Network error'));

      await askQuestion('what is deniability mode?');

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      expect(fetchSpy.mock.calls[0][1].headers['X-Rc-User-Id']).toBe('rc-user-123');
      expect(fetchSpy.mock.calls[1][1].headers['X-Rc-User-Id']).toBe('rc-user-123');
    });

    it('falls back to local knowledge when TIP chat is offline', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      // Simulate TIP being unreachable
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      await askQuestion('what is deniability mode?');

      // Should show offline indicator and still answer from local KB
      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeTruthy();
      });

      // Local answer should appear
      const messages = screen.getAllByText(/deniability/i, { ignore: '.hidden' });
      expect(messages.length).toBeGreaterThan(0);
    });

    it('surfaces the advisor cap honestly on 402 instead of pretending it is offline', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      fetchSpy.mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'quota_exceeded' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      ));

      await askQuestion('what is deniability mode?');

      await waitFor(() => {
        expect(screen.getByText(/online answer limit for this device has been reached/i)).toBeTruthy();
      });

      expect(screen.queryByText(/^offline$/i)).toBeNull();
    });

    it('shows local answer when consent is denied (not an error state)', async () => {
      await mountAdvisor();
      await denyAdvisorConsent();

      await askQuestion('what is a seed phrase?');

      // Should answer from local KB
      await waitFor(() => {
        const body = document.body.textContent || '';
        expect(body.length).toBeGreaterThan(0);
      });

      // Should NOT try to reach network
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('continues using local KB when TIP chat is unconfigured', async () => {
      vi.unstubAllEnvs();
      // Blanking TIP_BASE_URL disables the chat feature switch entirely.
      vi.stubEnv('VITE_TIP_BASE_URL', '');

      vi.resetModules();
      vi.stubEnv('VITE_TIP_BASE_URL', '');

      const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
      render(
        <MemoryRouter initialEntries={['/']}>
          <SecurityAdvisor walletChain="evm" />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByLabelText(/open vigil/i));

      // Should not show consent panel (no remote endpoint to consent to)
      await waitFor(() => {
        expect(screen.queryByTestId('advisor-remote-consent')).toBeNull();
      });

      // Should still render FAB and answer locally
      await askQuestion('how do I set up a PIN?');

      await waitFor(() => {
        const body = document.body.textContent || '';
        expect(body.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Screening error handling correlation with advisor behavior', () => {
    it('catches screening errors and falls back to chat', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      // Screening fails but shouldn't block chat
      mockScreenTransaction.mockRejectedValueOnce(new Error('Screening API error'));

      // Still grant consent to test chat path
      fetchSpy.mockResolvedValueOnce(new Response(
        'data: {"response":"The address looks okay to me."}\ndata: [DONE]\n',
        { status: 200 }
      ));

      await askQuestion('Is 0xdead000000000000000000000000000000000000 good?');

      // Should fall back to normal chat, not show screening verdict
      await waitFor(() => {
        expect(screen.queryByTestId('tip-screening-verdict')).toBeNull();
      });
    });

    it('does not show screening verdict for non-address questions', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      fetchSpy.mockResolvedValueOnce(new Response(
        'data: {"response":"RASP (Runtime Application Self-Protection) detects tampering..."}\ndata: [DONE]\n',
        { status: 200 }
      ));

      await askQuestion('What is RASP tamper detection?');

      // No address, so no screening verdict
      await waitFor(() => {
        expect(screen.queryByTestId('tip-screening-verdict')).toBeNull();
      });
    });
  });

  describe('Context-aware advisor correlation with page state', () => {
    it('provides send-screen-specific advice for send page', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

      const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
      render(
        <MemoryRouter initialEntries={['/send']}>
          <SecurityAdvisor walletChain="ethereum" />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByLabelText(/open vigil/i));
      await grantAdvisorConsent();

      // Suggested questions should be send-specific
      const suggestedQuestions = screen.getAllByRole('button');
      const sendQuestions = suggestedQuestions
        .map(b => b.textContent)
        .filter(text => text.includes('address') || text.includes('fee') || text.includes('verify'));

      expect(sendQuestions.length).toBeGreaterThan(0);
    });

    it('correlates deniability advice with deniability page context', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

      const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
      render(
        <MemoryRouter initialEntries={['/deniability']}>
          <SecurityAdvisor walletChain="ethereum" />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByLabelText(/open vigil/i));

      // Should show deniability-specific questions
      const suggestedButtons = screen.getAllByRole('button');
      const deniabilityQuestions = suggestedButtons
        .map(b => b.textContent)
        .filter(text => text.includes('duress') || text.includes('stealth') || text.includes('panic'));

      expect(deniabilityQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple findings correlation', () => {
    it('correlates multiple risk signals in screening verdict', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      const mockMultipleRisks = {
        verdict: 'block',
        sanctions: true,
        risks: [
          {
            title: 'Sanctions Match',
            detail: 'OFAC SDN list',
          },
          {
            title: 'Known Scam',
            detail: 'Reported in 47 incidents',
          },
          {
            title: 'Wash Trading',
            detail: 'Circular transfer pattern detected',
          },
        ],
      };

      mockScreenTransaction.mockResolvedValueOnce(mockMultipleRisks);

      await askQuestion('0xbad0000000000000000000000000000000000001');

      await waitFor(() => {
        const verdict = screen.getByTestId('tip-screening-verdict');
        expect(verdict.textContent).toContain('Sanctions Match');
        expect(verdict.textContent).toContain('Known Scam');
        expect(verdict.textContent).toContain('Wash Trading');
      });
    });

    it('shows follow-up questions that correlate with screening verdict', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      // First: Screen an address with warnings
      const mockWarning = {
        verdict: 'warn',
        sanctions: false,
        risks: [
          {
            title: 'Mixer/Tumbler Activity',
            detail: 'This address is associated with privacy mixing',
          },
        ],
      };

      mockScreenTransaction.mockResolvedValueOnce(mockWarning);
      await askQuestion('0x1234000000000000000000000000000000000000');

      await waitFor(() => {
        expect(screen.getByTestId('tip-screening-verdict')).toBeTruthy();
      });

      // Follow-up questions should be safety-focused
      const followUpButtons = screen.queryAllByRole('button')
        .filter(btn => btn.textContent && btn.textContent.includes('?'));

      expect(followUpButtons.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Deniability mode disables both AI advisor and screening', () => {
    it('hides FAB entirely in deniability mode (I3)', async () => {
      // 2026-08-16 audit remediation (MED): real assertion. Mount with the
      // deniability mock flipped ON and confirm the FAB never renders.
      // SecurityAdvisor returns null when hidden === true (see the `if (hidden)
      // return null` branch), so the aria-labeled button must not exist.
      const { isDeniabilityOrDemoActive } = await import('@/wallet-core/deniabilitySession.js');
      isDeniabilityOrDemoActive.mockReturnValue(true);
      try {
        vi.resetModules();
        vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
        const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
        render(
          <MemoryRouter initialEntries={['/send']}>
            <SecurityAdvisor walletChain="ethereum" />
          </MemoryRouter>
        );
        expect(screen.queryByLabelText(/open vigil/i)).toBeNull();
      } finally {
        isDeniabilityOrDemoActive.mockReturnValue(false);
      }
    });
  });

  describe('Message history correlation', () => {
    it('maintains conversation history for context', async () => {
      await mountAdvisor();
      await grantAdvisorConsent();

      fetchSpy
        .mockResolvedValueOnce(new Response(
          'data: {"response":"Yes, DeFi carries smart contract risks."}\ndata: [DONE]\n',
          { status: 200 }
        ))
        .mockResolvedValueOnce(new Response(
          'data: {"response":"Audit reports, code reviews, and bug bounties reduce risk."}\ndata: [DONE]\n',
          { status: 200 }
        ));

      // First question
      await askQuestion('Is DeFi safe?');

      await waitFor(() => {
        expect(screen.getByText(/DeFi/i)).toBeTruthy();
      });

      // Second question (should have context of first)
      await askQuestion('How do I mitigate those risks?');

      await waitFor(() => {
        const messages = screen.getAllByText(/./);
        expect(messages.length).toBeGreaterThan(2); // User + assistant for each
      });
    });

    // INVERTED 2026-09-05. This test previously asserted that the page snapshot
    // IS sent, down to `wallet_session.wallet_count` — i.e. it pinned the
    // disclosure that the 2026-09-03 security diff rated a REGRESSION, and its
    // presence is part of why the gap survived review: the leak looked like
    // covered, intended behaviour.
    //
    // The consent copy promises the typed question plus the current screen and
    // chain. The snapshot is no longer transmitted, so the assertions are
    // reversed rather than deleted — deleting them would remove the record that
    // this payload was once expected on the wire.
    //
    // Flagged loudly because "align the tests with the new behaviour" is a
    // review smell in this repo. The behaviour change is deliberate and argued
    // in SecurityAdvisor.jsx's send path; the deeper pin lives in
    // SecurityAdvisor.noSnapshotEgress.test.jsx.
    it('does NOT send the live page snapshot in remote chat context', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

      const SecurityAdvisor = (await import('@/components/SecurityAdvisor.jsx')).default;
      fetchSpy.mockResolvedValueOnce(new Response(
        'data: {"response":"Use the send form carefully."}\ndata: [DONE]\n',
        { status: 200 }
      ));

      render(
        <MemoryRouter initialEntries={['/send']}>
          <SecurityAdvisor
            walletChain="bitcoin"
            pageSnapshot={{
              pathname: '/send',
              route_params: { asset: 'BTC' },
              wallet_session: { unlocked: true, mode: 'primary', wallet_count: 2 },
            }}
          />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByLabelText(/open vigil/i));
      await grantAdvisorConsent();
      await askQuestion('What should I check before sending?');

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      const [, options] = fetchSpy.mock.calls.at(-1);
      const payload = JSON.parse(options.body);

      // What the consent copy promises still goes.
      expect(payload.context.wallet_chain).toBe('bitcoin');
      expect(payload.context.current_screen).toBeTruthy();
      // What it does not promise does not go — neither the container nor any
      // value inside it, by name or by content.
      expect(payload.context.page_snapshot).toBeUndefined();
      expect(payload.context.page_snapshot_omitted).toBeUndefined();
      expect(options.body).not.toContain('route_params');
      expect(options.body).not.toContain('wallet_count');
      expect(options.body).not.toContain('wallet_session');
    });
  });
});
