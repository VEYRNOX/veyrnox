// I3 deniability UI suspender for NewsSentimentPage.
//
// The Refresh button (and the auto-fetch mutation it triggers) hits
// openrouter.ai via base44.integrations.Core.InvokeLLM. In a decoy/hidden/demo
// session, the button MUST NOT render — hidden, not merely disabled, so there
// is no visible tell. The primitive-layer chokepoint
// (openrouterClient.invokeLLM throws I3_DENIABILITY_ACTIVE) is the belt; this
// UI hide is the suspenders.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

vi.mock('@/api/base44Client', () => ({
  LLM_AVAILABLE: true,
  base44: {
    entities: {
      NewsSentiment: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(undefined),
      },
    },
    integrations: { Core: { InvokeLLM: vi.fn() } },
  },
}));

// CryptoNewsFeed pulls in heavy live-feed modules that are unrelated to this
// pin; stub it out so the render is focused on the Refresh-button surface.
vi.mock('@/components/CryptoNewsFeed', () => ({ default: () => null }));

import NewsSentimentPage from '@/pages/NewsSentimentPage.jsx';
import { base44 } from '@/api/base44Client';

const REAL_ROW = {
  asset: 'BTC', headline: 'REAL-USER-SAVED-HEADLINE', source: 'x',
  sentiment: 'bullish', score: 0.5, published_at: '2026-09-20T00:00:00Z', summary: 's',
};

function renderPage(seed) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // A cache warmed by the primary session survives a flip to decoy.
  if (seed) qc.setQueryData(['news-sentiment'], seed);
  return render(
    <QueryClientProvider client={qc}>
      <NewsSentimentPage />
    </QueryClientProvider>,
  );
}

describe('NewsSentimentPage — I3 UI suspender', () => {
  beforeEach(() => setDeniabilitySession(false));
  afterEach(() => setDeniabilitySession(false));

  it('hides the Refresh button entirely when a deniability session is active', () => {
    setDeniabilitySession(true);
    renderPage();
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
  });

  it('renders the Refresh button in a real (non-deniability) session', () => {
    setDeniabilitySession(false);
    renderPage();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });
});

// K-2: the saved rows are the real user's refresh history in the shared
// entity store. A deniable session must not read them, and must not render a
// copy left in the query cache by the primary session.
describe('NewsSentimentPage — I3 shared-store read gate', () => {
  beforeEach(() => {
    setDeniabilitySession(false);
    vi.mocked(base44.entities.NewsSentiment.list).mockClear();
  });
  afterEach(() => setDeniabilitySession(false));

  it('does not read NewsSentiment in a deniability session', async () => {
    setDeniabilitySession(true);
    renderPage();
    await new Promise((r) => setTimeout(r, 20));
    expect(base44.entities.NewsSentiment.list).not.toHaveBeenCalled();
  });

  it('does not render cached real-user rows in a deniability session', () => {
    setDeniabilitySession(true);
    renderPage([REAL_ROW]);
    expect(screen.queryByText('REAL-USER-SAVED-HEADLINE')).not.toBeInTheDocument();
  });

  it('reads and renders the rows in a real session', async () => {
    vi.mocked(base44.entities.NewsSentiment.list).mockResolvedValueOnce([REAL_ROW]);
    renderPage();
    expect(await screen.findByText('REAL-USER-SAVED-HEADLINE')).toBeInTheDocument();
    expect(base44.entities.NewsSentiment.list).toHaveBeenCalled();
  });
});
