import { describe, it, expect } from 'vitest';
import { annualSavingPercent } from '../annualSaving';

describe('annualSavingPercent — the honest cases', () => {
  it('derives the saving from the two prices actually shown', () => {
    // USD base: 5.99/mo vs 49.99/yr -> 1 - 49.99/71.88 = 30.45% -> 30.
    expect(annualSavingPercent(5.99, 49.99)).toBe(30);
  });

  it('recomputes when the monthly side carries an offer and the annual does not', () => {
    // The exact asymmetry the file's own comment warns about: retention_50
    // resolves for monthly but retention_50_annual does not. Annual is then the
    // WORSE deal, and no badge may claim otherwise.
    expect(annualSavingPercent(2.99, 49.99)).toBeNull();
  });

  it('recomputes when the annual side carries an offer and the monthly does not', () => {
    // 5.99/mo vs 24.99/yr -> 1 - 24.99/71.88 = 65.2% -> 65.
    expect(annualSavingPercent(5.99, 24.99)).toBe(65);
  });

  it('is currency-agnostic — it only ever divides two prices from the same store', () => {
    // 900 JPY/mo vs 7500 JPY/yr -> 1 - 7500/10800 = 30.5% -> 31.
    expect(annualSavingPercent(900, 7500)).toBe(31);
  });
});

describe('annualSavingPercent — refuses to advertise a saving that is not there', () => {
  it('returns null when annual costs exactly 12x monthly', () => {
    expect(annualSavingPercent(5, 60)).toBeNull();
  });

  it('returns null when annual is MORE expensive than paying monthly', () => {
    expect(annualSavingPercent(5, 61)).toBeNull();
  });

  it('rounds to a whole percent and never rounds a sub-1% saving up to 1', () => {
    // 0.4% saving. Rounds to 0, which is not a claim worth making -> null.
    expect(annualSavingPercent(5, 59.75)).toBeNull();
  });
});

describe('annualSavingPercent — unresolvable input renders nothing (I4)', () => {
  it.each([
    ['both missing', undefined, undefined],
    ['monthly missing', undefined, 49.99],
    ['annual missing', 5.99, undefined],
    ['monthly null', null, 49.99],
    ['annual null', 5.99, null],
    ['monthly NaN', NaN, 49.99],
    ['annual NaN', 5.99, NaN],
    ['monthly Infinity', Infinity, 49.99],
    ['monthly zero', 0, 49.99],
    ['monthly negative', -5.99, 49.99],
    ['annual negative', 5.99, -49.99],
    ['monthly a string', '5.99', 49.99],
    ['annual a string', 5.99, '49.99'],
  ])('returns null when %s', (_label, monthly, annual) => {
    expect(annualSavingPercent(monthly, annual)).toBeNull();
  });

  it('never throws, whatever it is handed', () => {
    const junk = [{}, [], () => {}, Symbol('x'), true, false];
    for (const a of junk) {
      for (const b of junk) {
        expect(() => annualSavingPercent(a, b)).not.toThrow();
        expect(annualSavingPercent(a, b)).toBeNull();
      }
    }
  });
});
