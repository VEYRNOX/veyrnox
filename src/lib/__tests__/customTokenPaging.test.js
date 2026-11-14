import { describe, expect, it } from 'vitest';
import { CUSTOM_TOKEN_PAGE_SIZE, nextCustomTokenCount, pageCustomTokens } from '../customTokenPaging.js';

const tokens = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}` }));

describe('custom token paging', () => {
  it('shows the first 10 and reports the rest as hidden', () => {
    const { shown, hidden } = pageCustomTokens(tokens(25), CUSTOM_TOKEN_PAGE_SIZE);
    expect(shown).toHaveLength(10);
    expect(shown[9].id).toBe('t9');
    expect(hidden).toBe(15);
  });

  it('shows everything when there are 10 or fewer', () => {
    expect(pageCustomTokens(tokens(4), 10)).toEqual({ shown: tokens(4), hidden: 0 });
    expect(pageCustomTokens([], 10)).toEqual({ shown: [], hidden: 0 });
  });

  it('reveals the next 10 each step and never passes the total', () => {
    expect(nextCustomTokenCount(10, 25)).toBe(20);
    expect(nextCustomTokenCount(20, 25)).toBe(25);
    expect(nextCustomTokenCount(25, 25)).toBe(25);
  });

  it('survives bad input without throwing or showing fewer than a page', () => {
    expect(pageCustomTokens(null, undefined)).toEqual({ shown: [], hidden: 0 });
    expect(pageCustomTokens(tokens(25), 3).shown).toHaveLength(10);
    expect(pageCustomTokens(tokens(25), 1.5).shown).toHaveLength(10);
    expect(nextCustomTokenCount(undefined, 25)).toBe(20);
  });
});
