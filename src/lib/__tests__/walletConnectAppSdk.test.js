import { describe, expect, it, vi } from 'vitest';

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getBalanceEth: vi.fn(),
}));

vi.mock('@/wallet-core/evm/walletconnect/projectId.js', () => ({
  WALLETCONNECT_PROJECT_ID: 'f9d8b6cc36e18684ac1d2a76cdf54bea',
}));

describe('walletConnectAppSdk', () => {
  it('maps supported eip155 accounts into read-only import assets', async () => {
    const { buildWalletConnectImportPreview } = await import('../walletConnectAppSdk.js');

    const session = {
      namespaces: {
        eip155: {
          accounts: [
            'eip155:1:0x1111111111111111111111111111111111111111',
            'eip155:137:0x2222222222222222222222222222222222222222',
            'eip155:1:0x1111111111111111111111111111111111111111',
          ],
        },
      },
    };

    const readBalance = vi.fn(async (networkKey, address) => {
      if (networkKey === 'mainnet') {
        expect(address).toBe('0x1111111111111111111111111111111111111111');
        return '1.5';
      }
      if (networkKey === 'polygon') {
        expect(address).toBe('0x2222222222222222222222222222222222222222');
        return '2.75';
      }
      throw new Error(`unexpected network ${networkKey}`);
    });

    await expect(buildWalletConnectImportPreview(session, readBalance)).resolves.toEqual([
      {
        currency: 'ETH',
        address: '0x1111111111111111111111111111111111111111',
        balance: 1.5,
        balanceUnavailable: false,
        networkKey: 'mainnet',
        networkName: 'Ethereum Mainnet',
        caipNetworkId: 'eip155:1',
      },
      {
        currency: 'POL',
        address: '0x2222222222222222222222222222222222222222',
        balance: 2.75,
        balanceUnavailable: false,
        networkKey: 'polygon',
        networkName: 'Polygon Mainnet',
        caipNetworkId: 'eip155:137',
      },
    ]);
    expect(readBalance).toHaveBeenCalledTimes(2);
  });

  it('keeps supported addresses even when the balance read fails', async () => {
    const { buildWalletConnectImportPreview } = await import('../walletConnectAppSdk.js');

    const session = {
      namespaces: {
        eip155: {
          accounts: ['eip155:56:0x3333333333333333333333333333333333333333'],
        },
      },
    };

    const readBalance = vi.fn(async () => {
      throw new Error('rpc unavailable');
    });

    await expect(buildWalletConnectImportPreview(session, readBalance)).resolves.toEqual([
      {
        currency: 'BNB',
        address: '0x3333333333333333333333333333333333333333',
        balance: 0,
        balanceUnavailable: true,
        networkKey: 'bnb',
        networkName: 'BNB Smart Chain',
        caipNetworkId: 'eip155:56',
      },
    ]);
  });

  it('rejects sessions that do not contain any supported eip155 accounts', async () => {
    const { buildWalletConnectImportPreview } = await import('../walletConnectAppSdk.js');

    const session = {
      namespaces: {
        solana: {
          accounts: ['solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:Example'],
        },
        eip155: {
          accounts: ['eip155:999999:0x4444444444444444444444444444444444444444'],
        },
      },
    };

    await expect(buildWalletConnectImportPreview(session, vi.fn())).rejects.toThrow(
      'No supported WalletConnect accounts were returned by the connected wallet.',
    );
  });
});
