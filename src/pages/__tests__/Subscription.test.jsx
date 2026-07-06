import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

const getOfferings = vi.fn();
const purchasePackage = vi.fn();
const restorePurchases = vi.fn();
vi.mock('@/lib/purchases', () => ({
  getOfferings: (...a) => getOfferings(...a),
  purchasePackage: (...a) => purchasePackage(...a),
  restorePurchases: (...a) => restorePurchases(...a),
}));

const refreshTier = vi.fn();
const useTierMock = vi.fn();
vi.mock('@/lib/TierProvider', () => ({ useTier: () => useTierMock() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const Subscription = (await import('../Subscription')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <Subscription />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTierMock.mockReturnValue({ currentTier: 'free', tiers: [], refreshTier });
});

describe('Subscription page — web (no store)', () => {
  it('shows the mobile-only notice and a disabled upgrade button', async () => {
    isNativePlatform.mockReturnValue(false);
    renderPage();
    expect(screen.getByText(/testing-only/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /mobile only/i })).toBeDisabled();
  });
});

describe('Subscription page — native', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true);
    getOfferings.mockResolvedValue({
      availablePackages: [
        { identifier: '$rc_monthly', product: { priceString: '$5.99' } },
      ],
    });
  });

  it('shows the real store price once offerings load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
  });

  it('purchasing calls purchasePackage then refreshes the tier', async () => {
    purchasePackage.mockResolvedValue({});
    refreshTier.mockResolvedValue('safety_plus');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /upgrade to safety plus/i }));
    await waitFor(() => expect(purchasePackage).toHaveBeenCalledWith({
      identifier: '$rc_monthly',
      product: { priceString: '$5.99' },
    }));
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });

  it('restoring calls restorePurchases then refreshes the tier', async () => {
    restorePurchases.mockResolvedValue({});
    refreshTier.mockResolvedValue('free');
    renderPage();
    await waitFor(() => expect(screen.getByText('$5.99')).toBeTruthy());
    fireEvent.click(screen.getByText(/restore purchases/i));
    await waitFor(() => expect(restorePurchases).toHaveBeenCalled());
    await waitFor(() => expect(refreshTier).toHaveBeenCalled());
  });
});
