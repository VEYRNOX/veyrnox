import { describe, it, expect, beforeEach } from 'vitest';
import { isLivePricesEnabled, setLivePricesEnabled, LIVE_PRICE_PREF_KEY } from '../priceFeed';

describe('priceFeed — live prices default behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to OFF on a fresh device (I2 deniability)', () => {
    expect(isLivePricesEnabled()).toBe(false);
  });

  it('persists to ON when setLivePricesEnabled(true) is called', () => {
    setLivePricesEnabled(true);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
    expect(isLivePricesEnabled()).toBe(true);
  });

  it('persists to OFF when setLivePricesEnabled(false) is called', () => {
    setLivePricesEnabled(true);
    setLivePricesEnabled(false);
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBeNull();
    expect(isLivePricesEnabled()).toBe(false);
  });

  it('survives reload when set to ON', () => {
    setLivePricesEnabled(true);
    // Simulate page reload by checking localStorage directly
    expect(localStorage.getItem(LIVE_PRICE_PREF_KEY)).toBe('1');
  });
});
