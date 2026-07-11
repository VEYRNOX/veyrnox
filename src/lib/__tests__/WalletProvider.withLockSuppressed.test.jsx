// Ring-import baseline burn-down (issue #627): PriceAlerts.jsx and
// PasskeySetup.jsx (R3 UI layer) reached directly into @/wallet-core/keystore
// (R0/R1) only to call the lock-suppression escape hatch during an OS dialog.
// The fix routes them through the R2 WalletProvider facade instead, so the
// context value must expose `withLockSuppressed`.
//
// This pins the CONTRACT: `useWallet().withLockSuppressed` is a function that
// runs the supplied callback and returns its result. On web (test env) it is a
// transparent pass-through (Capacitor.isNativePlatform() is false), so the
// callback runs exactly once and its resolved value is returned.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

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
});
afterEach(() => {
  cleanup();
});

describe('WalletProvider exposes withLockSuppressed (R2 facade, issue #627)', () => {
  it('the context value carries a withLockSuppressed function', async () => {
    await renderProvider();
    expect(typeof ctx.withLockSuppressed).toBe('function');
  });

  it('runs the callback and returns its result (web pass-through)', async () => {
    await renderProvider();
    let ran = 0;
    let result;
    await act(async () => {
      result = await ctx.withLockSuppressed(async () => {
        ran += 1;
        return 'done';
      });
    });
    expect(ran).toBe(1);
    expect(result).toBe('done');
  });
});
