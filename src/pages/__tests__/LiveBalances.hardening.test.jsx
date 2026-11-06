// @ts-nocheck
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  getBalanceEth: vi.fn(),
  getProvider: vi.fn(),
  getTokenBalance: vi.fn(),
  link: Object.freeze({
    id: 'LINK:mainnet',
    symbol: 'LINK',
    name: 'Chainlink',
    family: 'erc20',
    chain: 'mainnet',
    status: 'receive_only',
  }),
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
vi.mock('@/wallet-core/evm/tokens', () => ({
  TOKENS: {
    mainnet: {
      USDC: {
        address: '0x1111111111111111111111111111111111111111',
        decimals: 6,
        symbol: 'USDC',
        assetId: 'USDC:mainnet',
      },
      LINK: {
        address: '0x2222222222222222222222222222222222222222',
        decimals: 18,
        symbol: 'LINK',
        assetId: 'LINK:mainnet',
      },
    },
  },
}));
vi.mock('@/wallet-core/evm/token-send', () => ({
  getTokenBalance: (...args) => h.getTokenBalance(...args),
}));
vi.mock('@/wallet-core/assets', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ASSETS: [...actual.ASSETS, h.link],
    getAssetById: (id) => id === h.link.id ? h.link : actual.getAssetById(id),
  };
});
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
  h.getTokenBalance.mockImplementation(async ({ symbol }) => {
    if (symbol === 'LINK') throw new Error('Decimals mismatch for LINK: configured 18, chain 8');
    return '4.5';
  });
});

describe('LiveBalances receive-only and decimals honesty', () => {
  it('selects Ethereum mainnet, shows the synthetic receive-only mismatch row, and labels only LIVE assets Live', async () => {
    render(<LiveBalances />);

    fireEvent.change(screen.getByLabelText('EVM wallet address'), { target: { value: ADDRESS } });
    fireEvent.click(screen.getByRole('option', { name: 'Ethereum Mainnet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Look up balances' }));

    await waitFor(() => expect(screen.getByText('LINK')).toBeInTheDocument());
    expect(h.getBalanceEth).toHaveBeenCalledWith('mainnet', ADDRESS);
    expect(h.getTokenBalance).toHaveBeenCalledWith({ networkKey: 'mainnet', symbol: 'USDC', owner: ADDRESS });
    expect(h.getTokenBalance).toHaveBeenCalledWith({ networkKey: 'mainnet', symbol: 'LINK', owner: ADDRESS });

    const linkRow = within(screen.getByTestId('token-row-LINK'));
    const usdcRow = within(screen.getByTestId('token-row-USDC'));
    expect(linkRow.getByText('Balance unavailable')).toBeInTheDocument();
    const receiveOnly = linkRow.getByText('Receive-only');
    expect(receiveOnly).toHaveAttribute('title', NON_LIVE_ASSET_SPEND_NOTICE);
    expect(linkRow.queryByText('Live')).not.toBeInTheDocument();
    expect(usdcRow.getByText('Live')).toBeInTheDocument();
    expect(usdcRow.queryByText('Receive-only')).not.toBeInTheDocument();

    expect(screen.getByText(/including enabled mainnets/i)).toBeInTheDocument();
    expect(screen.queryByText(/testnet only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified tokens only/i)).not.toBeInTheDocument();
  });
});
