// wallet-core/__tests__/coin-logo-local.test.js
//
// Deniability coupling (I2 / deniability-by-default) — PIN the invariant that
// coin/token icon selection is LOCAL-ONLY and can never become a holdings-
// revealing remote request. Icons are chosen by which assets a wallet holds; if
// logoFor() ever returned an http(s):// URL (loading eth.png vs usdc.png from a
// third party) or fetched keyed on the symbol, an on-path observer could infer
// holdings from the icon traffic — exactly what deniability must hide.
//
// logoFor(symbol) is the single resolver CoinLogo.jsx uses. It must:
//   (a) return a same-origin/relative path or data: URI — NEVER http(s)://;
//   (b) be pure over the symbol alone (no wallet-set/holdings context), so it
//       cannot egress holdings;
//   (c) invoke no global fetch during resolution.

import { describe, it, expect, vi } from 'vitest';
import { logoFor, TOP_SYMBOLS } from '@/lib/cryptos';

// Representative set: a top-10 coin, a stablecoin (ERC-20), plus unknown/fallback
// and empty inputs that exercise the non-top-10 path.
const SYMBOLS = ['ETH', 'USDC', 'BTC', 'sol', 'WEIRDCOIN', 'definitely-not-a-coin'];
const REMOTE = /^https?:\/\//i;

describe('logoFor — local-only icon resolution (deniability / I2)', () => {
  it('never returns an http(s):// (third-party) URL for any symbol', () => {
    for (const sym of [...TOP_SYMBOLS, ...SYMBOLS]) {
      const ref = logoFor(sym);
      expect(ref, `logoFor(${JSON.stringify(sym)})`).not.toMatch(REMOTE);
    }
  });

  it('returns a same-origin relative path or a data: URI', () => {
    for (const sym of [...TOP_SYMBOLS, ...SYMBOLS]) {
      const ref = logoFor(sym);
      expect(typeof ref).toBe('string');
      // Relative same-origin (starts with "/" but not "//" protocol-relative)
      // or a bundled data: URI. Anything else could reach a remote host.
      const local = ref.startsWith('data:') || (ref.startsWith('/') && !ref.startsWith('//'));
      expect(local, `logoFor(${JSON.stringify(sym)}) = ${ref}`).toBe(true);
    }
  });

  it('falsy / empty symbols resolve to null, never a remote URL', () => {
    for (const sym of [undefined, null, '', 0, false]) {
      expect(logoFor(sym)).toBeNull();
    }
  });

  it('is pure over the symbol only — no holdings/wallet-set context affects output', () => {
    // Same symbol always yields the same reference, and any extra arguments
    // (e.g. a holdings/wallet-set object) are ignored — they cannot leak.
    const a = logoFor('ETH');
    const b = logoFor('ETH', { holdings: ['ETH', 'USDC'], walletSet: 'secret' });
    expect(a).toBe(b);
    expect(logoFor('USDC')).not.toBe(a);
  });

  it('does not invoke global fetch during resolution', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('logoFor must not perform a network request');
    });
    try {
      for (const sym of [...TOP_SYMBOLS, ...SYMBOLS]) logoFor(sym);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
