// @ts-nocheck
// "Reference rate, not live market data" used to render unconditionally —
// directly under the "Live · <time>" label when the total WAS live.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { PriceBasisNote } from '@/pages/WalletPortfolioPage';
import { USD_REFERENCE_NOTE } from '@/lib/cryptos';

describe('PriceBasisNote', () => {
  it('live basis: shows the live refresh control and NOT the reference-rate note', () => {
    const onRefresh = vi.fn();
    render(<PriceBasisNote priceBasis="live" pricesUpdatedAt={null} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: /portfolio\.live/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(USD_REFERENCE_NOTE)).not.toBeInTheDocument();
  });

  it('approx basis: labels the total approximate AND discloses the reference rate', () => {
    render(<PriceBasisNote priceBasis="approx" pricesUpdatedAt={null} onRefresh={() => {}} />);
    expect(screen.getByText('portfolio.approximate')).toBeInTheDocument();
    expect(screen.getByText(USD_REFERENCE_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
