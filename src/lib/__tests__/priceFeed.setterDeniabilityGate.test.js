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
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0');
    expect(isLivePricesEnabled()).toBe(false);
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
    expect(isLivePricesEnabled()).toBe(true);
  });

  it('does NOT mint the off-key in a decoy/hidden session', () => {
    // Default = ON (absence). A decoy tapping "Disable" must not persist '0'.
    setDeniabilitySession(true);
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
  });

  it('does NOT mutate the pref in a demo session (persisted veyrnox-demo flag)', () => {
    localStorage.setItem('veyrnox-demo', '1');
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
  });

  it('does not FLIP a real off-preference from a decoy session either', () => {
    // Real user explicitly opted out ('0'). A decoy tapping "Enable" must not
    // clear that pref back to the ON default.
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0');

    setDeniabilitySession(true);
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0');
  });

  it('the real preference is untouched across a decoy round-trip', () => {
    setDeniabilitySession(true);
    setLivePricesEnabled(false);
    setDeniabilitySession(false);
    // Fresh device + a coerced decoy session that tapped "Disable" must leave
    // the device on the ON default (indistinguishable from never-touched).
    expect(isLivePricesEnabled()).toBe(true);
  });
});
