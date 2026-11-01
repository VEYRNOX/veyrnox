import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deniable: false,
  assetStatus: 'receive_only',
  getProvider: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../provider.js', () => ({
  getProvider: (...args) => h.getProvider(...args),
}));

vi.mock('../tokens.js', () => ({
  getToken: (...args) => h.getToken(...args),
  ERC20_ABI: [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function transfer(address to, uint256 amount) returns (bool)',
  ],
}));

vi.mock('../../assets.js', () => ({
  getAssetById: (id) => id === 'LINK:mainnet'
    ? { id, symbol: 'LINK', chain: 'mainnet', family: 'erc20', status: h.assetStatus }
    : null,
  canSend: (asset) => asset?.status === 'live',
  NON_LIVE_ASSET_SPEND_NOTICE:
    'Direct sends are disabled. Connected dApps may still spend this token through existing approvals.',
}));

vi.mock('../../deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => h.deniable,
}));

vi.mock('../networks.js', () => ({
  getNetwork: vi.fn(() => ({ chainId: 1, explorer: 'https://example.test' })),
}));

import { getTokenBalance, sendToken } from '../token-send.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const NOTICE = 'Direct sends are disabled. Connected dApps may still spend this token through existing approvals.';

beforeEach(() => {
  vi.clearAllMocks();
  h.deniable = false;
  h.assetStatus = 'receive_only';
  h.getToken.mockReturnValue({
    address: '0x3333333333333333333333333333333333333333',
    decimals: 18,
    symbol: 'LINK',
    assetId: 'LINK:mainnet',
  });
});

describe('sendToken capability boundary', () => {
  it('refuses a synthetic receive-only composite asset before provider construction or key use', async () => {
    await expect(sendToken({
      networkKey: 'mainnet',
      privateKey: '0x' + '11'.repeat(32),
      symbol: 'LINK',
      to: RECIPIENT,
      amount: '1',
    })).rejects.toThrow(`Token LINK:mainnet is not LIVE. ${NOTICE}`);

    expect(h.getToken).toHaveBeenCalledWith('mainnet', 'LINK');
    expect(h.getProvider).not.toHaveBeenCalled();
  });
});

describe('getTokenBalance I3/demo boundary', () => {
  it.each(['decoy', 'hidden', 'demo'])('builds no provider or Contract in a %s session', async () => {
    h.deniable = true;

    await expect(getTokenBalance({
      networkKey: 'mainnet',
      symbol: 'LINK',
      owner: OWNER,
    })).rejects.toThrow(/I3/);

    expect(h.getToken).not.toHaveBeenCalled();
    expect(h.getProvider).not.toHaveBeenCalled();
  });
});
