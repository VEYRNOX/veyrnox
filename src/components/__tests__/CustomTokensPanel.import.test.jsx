import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const TOKEN = '0x1111111111111111111111111111111111111111';
const OWNER = '0x2222222222222222222222222222222222222222';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
const inspectCustomToken = vi.fn();
const readCustomTokenBalance = vi.fn();
vi.mock('@/wallet-core/evm/customTokens.js', () => ({
  inspectCustomToken: (...a) => inspectCustomToken(...a),
  readCustomTokenBalance: (...a) => readCustomTokenBalance(...a),
}));
const store = { tokens: [] };
const saveCustomToken = vi.fn((t) => { store.tokens = [...store.tokens, t]; return t; });
vi.mock('@/lib/customTokenStore.js', () => ({
  listCustomTokens: () => store.tokens,
  removeCustomToken: vi.fn(),
  saveCustomToken: (...a) => saveCustomToken(...a),
}));

import CustomTokensPanel, { displayBalance } from '../CustomTokensPanel.jsx';
import { beginWipe, invalidatePendingWork } from '@/wallet-core/wipeEpoch.js';

const token = (over = {}) => ({
  id: `mainnet:${TOKEN.toLowerCase()}`, networkKey: 'mainnet', address: TOKEN, symbol: 'TKN', decimals: 6, ...over,
});

function mount(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
  const r = render(wrap(ui));
  return { ...r, rerenderPanel: (node) => r.rerender(wrap(node)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.tokens = [];
  readCustomTokenBalance.mockResolvedValue('1');
});

describe('displayBalance', () => {
  it('shows <0.00000001 for a positive value below display precision', () => {
    expect(displayBalance('0.000000000000000001')).toBe('<0.00000001');
    expect(displayBalance('0.000000009')).toBe('<0.00000001');
  });
  it('keeps normal and zero values', () => {
    expect(displayBalance('0.0')).toBe('0');
    expect(displayBalance('0')).toBe('0');
    expect(displayBalance('12.50000000')).toBe('12.5');
    expect(displayBalance('0.00000001')).toBe('0.00000001');
    expect(displayBalance('100.000000001')).toBe('100');
  });
});

describe('import invalidated by wipe/lock/unmount', () => {
  async function startImport() {
    let resolveInspect;
    inspectCustomToken.mockReturnValue(new Promise((r) => { resolveInspect = r; }));
    const utils = mount(<CustomTokensPanel ownerAddress={OWNER} visible />);
    fireEvent.click(screen.getByText('Add token'));
    fireEvent.change(screen.getByLabelText('Token contract address'), { target: { value: TOKEN } });
    fireEvent.click(screen.getByText('Read contract and add'));
    return { ...utils, resolveInspect };
  }

  it('persists when nothing happened (control)', async () => {
    const { resolveInspect } = await startImport();
    await act(async () => { resolveInspect(token()); });
    expect(saveCustomToken).toHaveBeenCalledOnce();
  });

  it('does not persist after a panic wipe', async () => {
    const { resolveInspect } = await startImport();
    await act(async () => { await beginWipe(); });
    await act(async () => { resolveInspect(token()); });
    expect(saveCustomToken).not.toHaveBeenCalled();
  });

  it('does not persist after a lock', async () => {
    const { resolveInspect } = await startImport();
    act(() => invalidatePendingWork());
    await act(async () => { resolveInspect(token()); });
    expect(saveCustomToken).not.toHaveBeenCalled();
  });

  it('does not persist after unmount', async () => {
    const { resolveInspect, unmount } = await startImport();
    unmount();
    await act(async () => { resolveInspect(token()); });
    expect(saveCustomToken).not.toHaveBeenCalled();
  });
});

describe('balance refresh and cache key', () => {
  it('manual refresh refetches and recovers from an initial RPC error', async () => {
    store.tokens = [token()];
    readCustomTokenBalance.mockRejectedValueOnce(new Error('rpc down'));
    mount(<CustomTokensPanel ownerAddress={OWNER} visible />);
    expect(await screen.findByText('rpc down')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByLabelText('Refresh custom token balances')); });
    expect(readCustomTokenBalance).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('1')).toBeTruthy();
  });

  it('re-imported token with changed decimals does not reuse the cached balance', async () => {
    store.tokens = [token({ decimals: 6 })];
    const { rerenderPanel } = mount(<CustomTokensPanel ownerAddress={OWNER} visible />);
    await screen.findByText('1');
    expect(readCustomTokenBalance).toHaveBeenCalledTimes(1);
    store.tokens = [token({ decimals: 18 })];
    // Force the panel's tokens state to re-read by remounting with the same client.
    rerenderPanel(<CustomTokensPanel key="again" ownerAddress={OWNER} visible />);
    await screen.findByText('1');
    expect(readCustomTokenBalance).toHaveBeenCalledTimes(2);
  });
});
