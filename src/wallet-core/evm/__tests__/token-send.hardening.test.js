import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  getNetworkInfo: (key) => (key === 'sepolia' ? { isTestnet: true } : key === 'mainnet' ? { isTestnet: false } : null),
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

describe('sendToken dev testnet verification exception', () => {
  const args = (networkKey) => ({
    networkKey,
    privateKey: '0x' + '11'.repeat(32),
    symbol: 'LINK',
    to: RECIPIENT,
    amount: '1',
  });
  afterEach(() => vi.unstubAllEnvs());

  it('lets an opted-in DEV build past the gate on a testnet only', async () => {
    vi.stubEnv('VITE_DEV_UNGATE_SEND', '1');
    const err = await sendToken(args('sepolia')).catch((e) => e);
    expect(String(err?.message)).not.toContain('is not LIVE');
    expect(h.getProvider).toHaveBeenCalled();
  });

  it('still refuses a receive-only token on mainnet even when the dev flag is set', async () => {
    vi.stubEnv('VITE_DEV_UNGATE_SEND', '1');
    await expect(sendToken(args('mainnet'))).rejects.toThrow('is not LIVE');
    expect(h.getProvider).not.toHaveBeenCalled();
  });

  it('refuses on a testnet without the explicit opt-in', async () => {
    vi.stubEnv('VITE_DEV_UNGATE_SEND', '');
    await expect(sendToken(args('sepolia'))).rejects.toThrow('is not LIVE');
    expect(h.getProvider).not.toHaveBeenCalled();
  });
});
