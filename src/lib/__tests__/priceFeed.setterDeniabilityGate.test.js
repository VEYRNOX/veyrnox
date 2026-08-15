// Branch review 2026-08-15 (C-1) — setLivePricesEnabled must be gated at the
// WRITER, not at one call site.
//
// WalletProvider.unlock() gated its own call on isPrimary, but four UI buttons
// write this key too — PriceCharts.jsx, Calculator.jsx,
// AssetCorrelationTimeline.jsx, CandlestickChart.jsx — and each of them renders
// SPECIFICALLY in a deniability session: every one computes
// `livePricesOn = isLivePricesEnabled() && !isDeniabilityOrDemoActive()` and
// falls into the "Live prices are disabled — Enable" branch when that is false.
// The routes are plain (App.jsx), not session-gated.
//
// LIVE_PRICE_PREF_KEY is itself in panic.js ALL_RESIDUE_KEYS, so an ungated
// write let a decoy/demo session MINT a key that panic.js classifies as proof of
// a real install — the exact class the surrounding PR set out to close (K-2).
//
// Behavioural, not a source scan: setLivePricesEnabled is a plain exported
// function, so drive the real deniability helper rather than asserting on text.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLivePricesEnabled, setLivePricesEnabled, LIVE_PRICE_PREF_KEY } from '../priceFeed';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

describe('setLivePricesEnabled — deniability write gate (C-1)', () => {
  beforeEach(() => {
    localStorage.clear();
    setDeniabilitySession(false);
  });
  afterEach(() => {
    setDeniabilitySession(false);
    localStorage.clear();
  });

  it('writes normally in a primary session (the guard must not break the real path)', () => {
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
    expect(isLivePricesEnabled()).toBe(true);
  });

  it('does NOT mint the key in a decoy/hidden session', () => {
    setDeniabilitySession(true);
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
  });

  it('does NOT mint the key in a demo session (persisted veyrnox-demo flag)', () => {
    // isDeniabilityOrDemoActive reads the flag LIVE, so a demo tour with no
    // unlocked vault (isDecoy/isHidden both false) is still covered.
    localStorage.setItem('veyrnox-demo', '1');
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
  });

  it('does not CLEAR a real preference from a decoy session either', () => {
    // The four UI buttons only ever pass `true`, but the writer is shared: a
    // decoy session must not be able to turn the real user's pref off.
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');

    setDeniabilitySession(true);
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
  });

  it('the real preference is untouched across a decoy round-trip', () => {
    setDeniabilitySession(true);
    setLivePricesEnabled(true);
    setDeniabilitySession(false);
    // Fresh device + a coerced decoy session that tapped "Enable" must leave
    // the device indistinguishable from one that never had a wallet.
    expect(isLivePricesEnabled()).toBe(false);
  });
});
