// @ts-nocheck
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  getBalanceEth: vi.fn(),
  getProvider: vi.fn(),
  getTokenBalance: vi.fn(),
}));

vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: (...args) => h.getBalanceEth(...args),
  getProvider: (...args) => h.getProvider(...args),
}));
vi.mock('@/wallet-core/evm/networks', () => ({
  listEnabledNetworks: () => [
    { key: 'sepolia', name: 'Sepolia Testnet', symbol: 'ETH', explorer: 'https://sepolia.example' },
    { key: 'mainnet', name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'https://mainnet.example' },
  ],
}));
vi.mock('@/wallet-core/evm/token-send', () => ({
  getTokenBalance: (...args) => h.getTokenBalance(...args),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: vi.fn() }));
vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react');
  const ChangeContext = ReactModule.createContext(() => {});
  return {
    Select: ({ onValueChange, children }) => (
      <ChangeContext.Provider value={onValueChange}>{children}</ChangeContext.Provider>
    ),
    SelectTrigger: ({ children }) => <span>{children}</span>,
    SelectValue: () => null,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ value, children }) => {
      const onValueChange = ReactModule.useContext(ChangeContext);
      return <button type="button" role="option" onClick={() => onValueChange(value)}>{children}</button>;
    },
  };
});

import LiveBalances from '../LiveBalances.jsx';
import { NON_LIVE_ASSET_SPEND_NOTICE } from '@/wallet-core/assets';

const ADDRESS = '0x3333333333333333333333333333333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  h.getBalanceEth.mockResolvedValue('1.25');
  h.getProvider.mockReturnValue({
    getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n }),
  });
  h.getTokenBalance.mockResolvedValue('4.5');
});

describe('LiveBalances receive-only and decimals honesty', () => {
  it('labels all four real Ethereum-mainnet receive-only tokens without Live or Verified claims', async () => {
    render(<LiveBalances />);

    fireEvent.change(screen.getByLabelText('EVM wallet address'), { target: { value: ADDRESS } });
    fireEvent.click(screen.getByRole('option', { name: 'Ethereum Mainnet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Look up balances' }));

    await waitFor(() => expect(screen.getByText('LINK')).toBeInTheDocument());
    expect(h.getBalanceEth).toHaveBeenCalledWith('mainnet', ADDRESS);
    expect(h.getTokenBalance).toHaveBeenCalledWith({ networkKey: 'mainnet', symbol: 'USDC', owner: ADDRESS });
    expect(h.getTokenBalance).toHaveBeenCalledWith({ networkKey: 'mainnet', symbol: 'LINK', owner: ADDRESS });

    const usdcRow = within(screen.getByTestId('token-row-USDC'));
    for (const symbol of ['LINK', 'UNI', 'SHIB', 'LEO']) {
      expect(h.getTokenBalance).toHaveBeenCalledWith({ networkKey: 'mainnet', symbol, owner: ADDRESS });
      const row = within(screen.getByTestId(`token-row-${symbol}`));
      expect(row.getByText('Receive-only')).toHaveAttribute('title', NON_LIVE_ASSET_SPEND_NOTICE);
      expect(row.queryByText('Live')).not.toBeInTheDocument();
      expect(row.queryByText(/Verified/i)).not.toBeInTheDocument();
    }
    expect(usdcRow.getByText('Live')).toBeInTheDocument();
    expect(usdcRow.queryByText('Receive-only')).not.toBeInTheDocument();

    expect(screen.getByText(/including enabled mainnets/i)).toBeInTheDocument();
    expect(screen.queryByText(/testnet only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified tokens only/i)).not.toBeInTheDocument();
  });
});
