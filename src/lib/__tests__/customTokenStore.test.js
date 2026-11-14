import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';
import {
  CUSTOM_TOKEN_STORAGE_KEY,
  listCustomTokens,
  removeCustomToken,
  saveCustomToken,
} from '../customTokenStore.js';

const TOKEN = {
  networkKey: 'mainnet',
  address: '0x1111111111111111111111111111111111111111',
  symbol: 'TKN',
  decimals: 6,
};

beforeEach(() => {
  vi.restoreAllMocks();
  isDeniabilityOrDemoActive.mockReturnValue(false);
  localStorage.clear();
});

describe('custom token store', () => {
  it('persists only validated, canonical public metadata', () => {
    const saved = saveCustomToken(TOKEN);
    expect(saved.id).toBe(`mainnet:${TOKEN.address}`);
    expect(listCustomTokens()).toEqual([saved]);
    expect(JSON.parse(localStorage.getItem(CUSTOM_TOKEN_STORAGE_KEY))).toEqual([saved]);
  });

  it('drops hostile or corrupt persisted metadata before display', () => {
    localStorage.setItem(CUSTOM_TOKEN_STORAGE_KEY, JSON.stringify([
      TOKEN,
      { ...TOKEN, address: '0x1234' },
      { ...TOKEN, address: '0x3333333333333333333333333333333333333333', symbol: '<script>' },
    ]));
    expect(listCustomTokens()).toHaveLength(1);
    expect(listCustomTokens()[0].symbol).toBe('TKN');
  });

  it('returns no token list and does not read shared storage in a deniability session', () => {
    localStorage.setItem(CUSTOM_TOKEN_STORAGE_KEY, JSON.stringify([TOKEN]));
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(listCustomTokens()).toEqual([]);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('refuses writes in a deniability session before touching shared storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(() => saveCustomToken(TOKEN)).toThrow(/private session/i);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('removes the final token without leaving an empty-list residue key', () => {
    const saved = saveCustomToken(TOKEN);
    expect(removeCustomToken(saved.id)).toBe(true);
    expect(localStorage.getItem(CUSTOM_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
