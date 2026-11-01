// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import {
  AssetBalanceValues,
  FiatApproximationNote,
  fmtSatoshis,
} from '@/pages/WalletPortfolioPage';

describe('WalletPortfolioPage asset values', () => {
  it('renders fiat as the primary line and native units as the secondary line', () => {
    const { container } = render(
      <AssetBalanceValues
        row={{ amount: 1.25, usd: 2500, indeterminate: false }}
        symbol="ETH"
        locale="en-US"
        fmtFiatValue={(usd) => `fiat:${usd}`}
        balanceLoadFailedTitle="Balance failed"
      />,
    );
    const [primary, secondary] = container.firstElementChild.children;
    expect(primary).toHaveTextContent('fiat:2500');
    expect(primary).toHaveClass('text-sm', 'font-mono');
    expect(secondary).toHaveTextContent('1.25');
    expect(secondary).toHaveClass('text-xs', 'text-muted-foreground');
  });

  it('keeps a failed read indeterminate on both lines and preserves its warning', () => {
    const fmtFiatValue = vi.fn();
    const { container } = render(
      <AssetBalanceValues
        row={{ amount: null, usd: null, indeterminate: true }}
        symbol="ETH"
        locale="en-US"
        fmtFiatValue={fmtFiatValue}
        balanceLoadFailedTitle="Balance failed"
      />,
    );
    const [primary, secondary] = container.firstElementChild.children;
    expect(primary).toHaveTextContent('—');
    expect(primary).toHaveAttribute('title', 'Balance failed');
    expect(secondary).toHaveTextContent('—');
    expect(screen.getByLabelText('Balance failed')).toHaveTextContent('⚠');
    expect(fmtFiatValue).not.toHaveBeenCalled();
  });

  it('renders BTC secondary values as exact, grouped satoshis', () => {
    expect(fmtSatoshis(12_345_678n, 'en-US')).toBe('12,345,678 sats');
    expect(fmtSatoshis(undefined, 'en-US')).toBe('—');
    const { container } = render(
      <AssetBalanceValues
        row={{ amount: 0.12345678, usd: 10000, sats: '12345678', indeterminate: false }}
        symbol="BTC"
        locale="en-US"
        fmtFiatValue={(usd) => `fiat:${usd}`}
        balanceLoadFailedTitle="Balance failed"
      />,
    );
    expect(container.firstElementChild.children[1]).toHaveTextContent('12,345,678 sats');
  });

  it('labels non-USD values as approximate fixed-rate figures', () => {
    const { rerender } = render(<FiatApproximationNote fiatCurrency="GBP" />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Approximate GBP values using fixed reference rates.',
    );
    rerender(<FiatApproximationNote fiatCurrency="USD" />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
