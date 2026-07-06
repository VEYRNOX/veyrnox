// src/components/__tests__/FeatureGate.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/featureRegistry', () => ({
  featureRouteOutcome: (path) => (path === '/cut-route' ? 'notFound' : path === '/off-route' ? 'disabled' : 'render'),
}));
vi.mock('@/lib/featureRegistry', async () => {
  const actual = {};
  return {
    ...actual,
    featureRouteOutcome: (path) =>
      path === '/cut-route' ? 'notFound' : path === '/off-route' ? 'disabled' : 'render',
  };
});
vi.mock('@/lib/safetyPlusRoutes', () => ({
  isSafetyPlusRoute: (path) => path === '/risk-score',
}));

const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({ useTier: () => useTierMock() }));

const FeatureGate = (await import('../FeatureGate')).default;

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FeatureGate>
        <div data-testid="page">real page</div>
      </FeatureGate>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeatureGate — Safety Plus tier check', () => {
  it('renders the page for a non-Safety-Plus route regardless of tier', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/dashboard');
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('renders a loading state for a Safety Plus route while tier is resolving', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: true });
    renderAt('/risk-score');
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('renders TierLockedPage for a Safety Plus route when the user is free', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/risk-score');
    expect(screen.queryByTestId('page')).toBeNull();
    expect(screen.getByText(/Safety Plus feature/)).toBeTruthy();
  });

  it('renders the real page for a Safety Plus route when the user is subscribed', () => {
    useTierMock.mockReturnValue({ currentTier: 'safety_plus', loading: false });
    renderAt('/risk-score');
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('still returns Not Found for a cut route ahead of the tier check', () => {
    useTierMock.mockReturnValue({ currentTier: 'free', loading: false });
    renderAt('/cut-route');
    expect(screen.queryByTestId('page')).toBeNull();
  });
});
