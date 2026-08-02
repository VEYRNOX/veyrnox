import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/demoClient', () => ({
  DEMO: false,
}));

describe('SecurityAdvisor', () => {
  let SecurityAdvisor;
  let isDeniabilityOrDemoActive;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    SecurityAdvisor = (await import('../SecurityAdvisor.jsx')).default;
  });

  it('renders FAB when not in deniability', () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/send']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
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
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
  });

  it('renders on dashboard route (app-wide)', () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={['/']}>
        <SecurityAdvisor walletChain="evm" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /open security advisor/i })).toBeDefined();
  });
});
