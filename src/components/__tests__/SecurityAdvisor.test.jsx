import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/demoClient', () => ({
  DEMO: false,
}));

describe('SecurityAdvisor', () => {
  let SecurityAdvisor;
  let isDeniabilityOrDemoActive;
  let resolveScreen;
  let getSuggestedQuestions;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    const advisorModule = await import('../SecurityAdvisor.jsx');
    SecurityAdvisor = advisorModule.default;
    resolveScreen = advisorModule.resolveScreen;
    getSuggestedQuestions = advisorModule.getSuggestedQuestions;
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

  it('maps representative deep routes to specific advisor screens', () => {
    expect(resolveScreen('/personal-backup')).toBe('personal_backup');
    expect(resolveScreen('/token-approvals')).toBe('token_approvals');
    expect(resolveScreen('/analytics')).toBe('analytics');
    expect(resolveScreen('/asset/eth')).toBe('asset_detail');
  });

  it('offers page-specific suggestions for recovery, approvals, and analytics surfaces', () => {
    expect(getSuggestedQuestions('personal_backup')).toContain('How does personal backup work?');
    expect(getSuggestedQuestions('token_approvals')).toContain('How do I revoke a risky approval?');
    expect(getSuggestedQuestions('analytics')).toContain('What does this analytics page tell me?');
  });

  it('covers every static app route with a non-generic screen mapping', () => {
    const appSrc = readFileSync(join(process.cwd(), 'src', 'App.jsx'), 'utf8');
    const routes = [...appSrc.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
    const unmapped = routes.filter((route) => {
      if (route === '*' || route.startsWith('/dev/') || route.includes(':')) return false;
      return resolveScreen(route) === 'general';
    });
    expect(unmapped).toEqual([]);
  });
});
