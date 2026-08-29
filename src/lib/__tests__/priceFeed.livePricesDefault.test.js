import { describe, it, expect, beforeEach } from 'vitest';
import { isLivePricesEnabled, setLivePricesEnabled, LIVE_PRICE_PREF_KEY } from '../priceFeed';

describe('priceFeed — live prices default behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to ON on a fresh device (owner-authorized 2026-08-25)', () => {
    expect(isLivePricesEnabled()).toBe(true);
  });

  it('persists to OFF when setLivePricesEnabled(false) is called', () => {
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0');
    expect(isLivePricesEnabled()).toBe(false);
  });

  it('persists to ON when setLivePricesEnabled(true) is called (absence = on)', () => {
    setLivePricesEnabled(false);
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
    expect(isLivePricesEnabled()).toBe(true);
  });

  it('survives reload when set to OFF', () => {
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('0');
  });
});
