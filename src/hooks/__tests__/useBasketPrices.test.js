import { describe, it, expect } from 'vitest';
import { parseBasket } from '../useBasketPrices.js';
import { TOP_SYMBOLS } from '@/lib/cryptos';

describe('parseBasket — pricemultifull RAW extraction', () => {
  it('extracts finite change / high / low per symbol', () => {
    const raw = { RAW: { BTC: { USD: { CHANGEPCT24HOUR: 2.5, HIGH24HOUR: 70000, LOW24HOUR: 66000 } } } };
    expect(parseBasket(raw).BTC).toEqual({ change24h: 2.5, high24h: 70000, low24h: 66000 });
  });

  it('maps missing / non-finite fields to null (fail-honest)', () => {
    const raw = { RAW: { ETH: { USD: { CHANGEPCT24HOUR: 'x', HIGH24HOUR: null } } } };
    expect(parseBasket(raw).ETH).toEqual({ change24h: null, high24h: null, low24h: null });
  });

  it('includes every TOP_SYMBOL even when absent from the payload', () => {
    const out = parseBasket({ RAW: {} });
    for (const s of TOP_SYMBOLS) {
      expect(out[s]).toEqual({ change24h: null, high24h: null, low24h: null });
    }
  });

  it('throws when the RAW payload is missing (caller treats as not-live)', () => {
    expect(() => parseBasket({})).toThrow();
  });
});
