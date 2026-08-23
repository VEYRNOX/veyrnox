// Regression guard: AI Security Advisor FAB stays visible for FREE users
// (offline knowledge is free for all tiers). The Safety Plus paywall gates
// only the two REMOTE paths (tip-chat SSE + tip-screen address lookup); free
// users fall back to the local knowledge base, same as when TIP is
// unconfigured or consent is denied.
//
// Do NOT re-hide the FAB for free tier — that regression would delete offline
// advisor for the free tier and contradict the marketing promise. If you
// touch the `hidden` expression in SecurityAdvisor.jsx and this file turns
// red, the fix is in the code, not the assertion.
//
// Server-side entitlement proof at tip-chat / tip-screen is enforced in the
// Edge Functions (see supabase/functions/tip-{chat,screen}/index.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => useTierMock(),
}));

describe('SecurityAdvisor tier gate', () => {
  let SecurityAdvisor;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    SecurityAdvisor = (await import('../SecurityAdvisor.jsx')).default;
  });

  const renderAdvisor = () => render(
    <MemoryRouter initialEntries={['/send']}>
      <SecurityAdvisor walletChain="evm" />
    </MemoryRouter>
  );

  it('renders FAB for safety_plus tier', () => {
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', loading: false });
    renderAdvisor();
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
  });

  it('renders FAB for free tier (offline knowledge is free)', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAdvisor();
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
  });

  it('renders FAB while tier is loading (do not flash the FAB in and out)', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: true });
    renderAdvisor();
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
  });
});
