import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

const PASSWORD = 'correct horse battery staple';
const state = vi.hoisted(() => ({ depth: 0 }));

vi.mock('@/wallet-core/keystore', () => {
  const LEGACY =
    'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const mockKeyStore = {
    async hasVault() { return true; },
    async hasVaultKekWrap() { return true; },
    async unlock() { return LEGACY; },
    async saveVaultContents() {},
    getHardwareFactor: async () => new Uint8Array(32),
    lock() {},
    async clearVault() {},
    setLockHook() {},
  };
  return {
    getKeyStore: () => mockKeyStore,
    webKeyStore: mockKeyStore,
    withLockSuppressed: async (fn) => {
      state.depth++;
      try { return await fn(); } finally { state.depth--; }
    },
  };
});

// Import AFTER the mock is registered.
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

let ctx;
function Capture() {
  ctx = useWallet();
  return null;
}
async function renderProvider() {
  await act(async () => {
    render(
      <WalletProvider>
        <Capture />
      </WalletProvider>,
    );
  });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  state.depth = 0;
});
afterEach(() => {
  cleanup();
});


describe('Buy session idle continuity', () => {
  async function unlock() {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderProvider();
    await act(async () => { await ctx.unlock(PASSWORD); });
    act(() => ctx.setAutoLockTimeout('1'));
  }
  afterEach(() => vi.useRealTimers());
  it('pauses idle locking during checkout, then starts a fresh countdown', async () => {
    await unlock();
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    let buy;
    act(() => { buy = ctx.withBuyLockSuppressed(() => pending); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(ctx.isUnlocked).toBe(true);
    // Activity/settings must not accidentally re-arm idle locking mid-buy.
    act(() => ctx.setAutoLockTimeout('1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(ctx.isUnlocked).toBe(true);
    await act(async () => { finish(); await buy; });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(ctx.isUnlocked).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(ctx.isUnlocked).toBe(false);
  });
  it('manual lock cancels the pending suppression', async () => {
    await unlock();
    let buy;
    act(() => { buy = ctx.withBuyLockSuppressed(() => new Promise(() => {})); });
    await act(async () => { ctx.lock(); await buy; });
    expect(ctx.isUnlocked).toBe(false);
    expect(state.depth).toBe(0);
  });
  it('does not suppress the absolute session ceiling', async () => {
    await unlock();
    let buy;
    act(() => { buy = ctx.withBuyLockSuppressed(() => new Promise(() => {})); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8 * 60 * 60_000); await buy; });
    expect(ctx.isUnlocked).toBe(false);
  });
  it('restores idle locking when checkout rejects', async () => {
    await unlock();
    await act(async () => {
      await expect(ctx.withBuyLockSuppressed(async () => { throw new Error('cancelled'); }))
        .rejects.toThrow('cancelled');
    });
    expect(state.depth).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(ctx.isUnlocked).toBe(false);
  });
});
