import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const listCustomTokens = vi.fn(() => [{
  id: 'mainnet:secret',
  networkKey: 'mainnet',
  address: '0x1111111111111111111111111111111111111111',
  symbol: 'REALTOKEN',
  decimals: 18,
}]);

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => true),
}));
vi.mock('@/lib/customTokenStore.js', () => ({
  listCustomTokens: (...args) => listCustomTokens(...args),
  removeCustomToken: vi.fn(),
  saveCustomToken: vi.fn(),
}));

import CustomTokensPanel from '../CustomTokensPanel.jsx';

describe('CustomTokensPanel deniability boundary', () => {
  it('mounts no list/storage/RPC surface and reveals no token or wallet metadata', () => {
    const { container, queryByText } = render(
      <CustomTokensPanel
        ownerAddress="0x2222222222222222222222222222222222222222"
        visible
      />,
    );
    expect(container.innerHTML).toBe('');
    expect(queryByText('REALTOKEN')).toBeNull();
    expect(listCustomTokens).not.toHaveBeenCalled();
  });
});
