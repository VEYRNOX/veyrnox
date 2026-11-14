import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '../../deniabilitySession.js';
import {
  assertCustomTokenDecimalsMatch,
  inspectCustomToken,
  readCustomTokenBalance,
  validateCustomTokenAddress,
  validateCustomTokenDecimals,
  validateCustomTokenSymbol,
} from '../customTokens.js';

const TOKEN = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';

function fixture({ code = '0x60016000', symbol = 'TKN', decimals = 6n, balance = 1234567n } = {}) {
  const provider = { getCode: vi.fn(async () => code) };
  const contract = {
    symbol: vi.fn(async () => symbol),
    decimals: vi.fn(async () => decimals),
    balanceOf: vi.fn(async () => balance),
  };
  const providerFactory = vi.fn(() => provider);
  const contractFactory = vi.fn(() => contract);
  return { provider, contract, providerFactory, contractFactory };
}

beforeEach(() => {
  vi.clearAllMocks();
  isDeniabilityOrDemoActive.mockReturnValue(false);
});

describe('custom-token boundary validation', () => {
  it('rejects wrong types and wrong-length addresses before creating a provider', async () => {
    const f = fixture();
    expect(() => validateCustomTokenAddress(123)).toThrow(/42-character contract address/i);
    await expect(inspectCustomToken({
      networkKey: 'mainnet',
      address: '0x1234',
      providerFactory: f.providerFactory,
      contractFactory: f.contractFactory,
    })).rejects.toThrow(/42-character contract address/i);
    expect(f.providerFactory).not.toHaveBeenCalled();
    expect(f.contractFactory).not.toHaveBeenCalled();
  });

  it('rejects an EOA/non-contract address and never asks it for metadata', async () => {
    const f = fixture({ code: '0x' });
    await expect(inspectCustomToken({
      networkKey: 'mainnet', address: TOKEN, ...f,
    })).rejects.toThrow(/No contract was found/i);
    expect(f.provider.getCode).toHaveBeenCalledWith(TOKEN);
    expect(f.contractFactory).not.toHaveBeenCalled();
  });

  it('reads symbol and decimals from the contract instead of accepting typed metadata', async () => {
    const f = fixture({ symbol: 'CHAIN', decimals: 9n });
    const token = await inspectCustomToken({ networkKey: 'polygon', address: TOKEN, ...f });
    expect(token).toMatchObject({
      id: `polygon:${TOKEN}`,
      networkKey: 'polygon',
      address: TOKEN,
      symbol: 'CHAIN',
      decimals: 9,
    });
    expect(f.contract.symbol).toHaveBeenCalledOnce();
    expect(f.contract.decimals).toHaveBeenCalledOnce();
  });

  it('rejects HTML-like/control metadata and enforces the symbol length cap', () => {
    expect(() => validateCustomTokenSymbol('<img src=x>')).toThrow(/Token symbols must/i);
    expect(() => validateCustomTokenSymbol('A\nB')).toThrow(/Token symbols must/i);
    expect(() => validateCustomTokenSymbol('A'.repeat(17))).toThrow(/1–16/i);
    expect(validateCustomTokenSymbol('SAFE_2')).toBe('SAFE_2');
    expect(validateCustomTokenSymbol('$WIF')).toBe('$WIF');
  });

  it('wires hostile on-chain symbol rejection into the import path', async () => {
    const f = fixture({ symbol: '<script>alert(1)</script>' });
    await expect(inspectCustomToken({ networkKey: 'mainnet', address: TOKEN, ...f }))
      .rejects.toThrow(/Token symbols must/i);
    expect(f.contract.symbol).toHaveBeenCalledOnce();
  });

  it('rejects out-of-range or non-integer decimals', () => {
    expect(() => validateCustomTokenDecimals(-1)).toThrow(/0 to 36/i);
    expect(() => validateCustomTokenDecimals(37n)).toThrow(/0 to 36/i);
    expect(() => validateCustomTokenDecimals(1.5)).toThrow(/whole number/i);
  });
});

describe('custom-token fail-closed reads', () => {
  it('rejects a decimals mismatch before balanceOf can return a mis-scaled balance', async () => {
    const f = fixture({ decimals: 18n });
    const token = { networkKey: 'mainnet', address: TOKEN, symbol: 'TKN', decimals: 6 };
    await expect(readCustomTokenBalance({ token, owner: OWNER, ...f }))
      .rejects.toThrow(/decimals changed from 6 to 18/i);
    expect(f.contract.balanceOf).not.toHaveBeenCalled();
  });

  it('formats a balance only after decimals match', async () => {
    const f = fixture({ decimals: 6n, balance: 1234567n });
    const token = { networkKey: 'mainnet', address: TOKEN, symbol: 'TKN', decimals: 6 };
    await expect(readCustomTokenBalance({ token, owner: OWNER, ...f })).resolves.toBe('1.234567');
    expect(f.contract.decimals.mock.invocationCallOrder[0])
      .toBeLessThan(f.contract.balanceOf.mock.invocationCallOrder[0]);
  });

  it('the pure mismatch guard has a plain-language error', () => {
    expect(() => assertCustomTokenDecimalsMatch(6, 18)).toThrow(/Remove and add the token again/i);
  });

  it('makes zero provider calls in a deniability session', async () => {
    const f = fixture();
    isDeniabilityOrDemoActive.mockReturnValue(true);
    await expect(inspectCustomToken({ networkKey: 'mainnet', address: TOKEN, ...f }))
      .rejects.toThrow(/private session/i);
    await expect(readCustomTokenBalance({
      token: { networkKey: 'mainnet', address: TOKEN, symbol: 'TKN', decimals: 6 },
      owner: OWNER,
      ...f,
    })).rejects.toThrow(/private session/i);
    expect(f.providerFactory).not.toHaveBeenCalled();
    expect(f.contractFactory).not.toHaveBeenCalled();
  });
});

describe('custom-token session re-check after each await', () => {
  const stored = { networkKey: 'mainnet', address: TOKEN, symbol: 'TKN', decimals: 6 };

  it('inspect: session turning private while getCode() is pending sends no symbol()/decimals()', async () => {
    const f = fixture();
    f.provider.getCode.mockImplementation(async () => {
      isDeniabilityOrDemoActive.mockReturnValue(true);
      return '0x60016000';
    });
    await expect(inspectCustomToken({ networkKey: 'mainnet', address: TOKEN, ...f }))
      .rejects.toThrow(/private session/i);
    expect(f.contractFactory).not.toHaveBeenCalled();
    expect(f.contract.symbol).not.toHaveBeenCalled();
    expect(f.contract.decimals).not.toHaveBeenCalled();
  });

  it('balance: session turning private while decimals() is pending never sends balanceOf(owner)', async () => {
    const f = fixture({ decimals: 6n });
    f.contract.decimals.mockImplementation(async () => {
      isDeniabilityOrDemoActive.mockReturnValue(true);
      return 6n;
    });
    await expect(readCustomTokenBalance({ token: stored, owner: OWNER, ...f }))
      .rejects.toThrow(/private session/i);
    expect(f.contract.balanceOf).not.toHaveBeenCalled();
  });

  it('balance: the denial is not swallowed as a generic balance error', async () => {
    const f = fixture();
    f.contract.balanceOf.mockImplementation(async () => {
      isDeniabilityOrDemoActive.mockReturnValue(true);
      return 5n;
    });
    await expect(readCustomTokenBalance({ token: stored, owner: OWNER, ...f }))
      .rejects.toMatchObject({ code: 'CUSTOM_TOKEN_DENIABLE' });
  });
});
