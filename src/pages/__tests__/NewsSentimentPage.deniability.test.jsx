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

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
