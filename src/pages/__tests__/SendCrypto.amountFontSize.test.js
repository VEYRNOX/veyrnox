// Amount field font size — behaviour + the `!` prefix that makes it apply at all.
//
// index.css carries a global iOS-auto-zoom guard,
// `input:not([type="range"])...{ font-size: max(16px, 1em) }`. Its specificity
// (0,3,1) beats a font-size utility (0,1,0), so a bare `text-7xl` on this input
// computes to the root size and the class is inert — measured at 18px in a
// browser against the compiled stylesheet. Every branch therefore has to emit
// the important variant, and the source pin below is what stops a later tidy-up
// from dropping the `!` and silently reverting the field to body size.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { amountFontSizeClass } from '../SendCrypto.jsx';

const here = dirname(fileURLToPath(import.meta.url));
// Strip comments so a pin can never be satisfied by the prose describing it.
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('amountFontSizeClass', () => {
  it('gives the largest size to short amounts', () => {
    expect(amountFontSizeClass('')).toBe('!text-7xl');
    expect(amountFontSizeClass('1.25')).toBe('!text-7xl');
    expect(amountFontSizeClass('123456')).toBe('!text-7xl');
  });

  it('steps down as the value gets longer', () => {
    expect(amountFontSizeClass('1234567')).toBe('!text-5xl');
    expect(amountFontSizeClass('0.00000001')).toBe('!text-5xl');
    expect(amountFontSizeClass('0.000000012')).toBe('!text-4xl');
    expect(amountFontSizeClass('0.00000001234')).toBe('!text-4xl');
    expect(amountFontSizeClass('0.000000012345')).toBe('!text-3xl');
    expect(amountFontSizeClass('0.123456789012345678')).toBe('!text-2xl');
  });

  it('never grows as the value grows', () => {
    const rank = ['!text-2xl', '!text-3xl', '!text-4xl', '!text-5xl', '!text-7xl'];
    let prev = rank.length - 1;
    for (let n = 0; n <= 24; n += 1) {
      const i = rank.indexOf(amountFontSizeClass('9'.repeat(n)));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(prev);
      prev = i;
    }
  });

  it('treats null/undefined as empty rather than throwing', () => {
    expect(amountFontSizeClass(null)).toBe('!text-7xl');
    expect(amountFontSizeClass(undefined)).toBe('!text-7xl');
  });

  it('emits only important font-size utilities', () => {
    const body = src.slice(src.indexOf('export function amountFontSizeClass'));
    const fn = body.slice(0, body.indexOf('\n}') + 2);
    const emitted = [...fn.matchAll(/'(!?text-[\w]+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(0);
    for (const cls of emitted) expect(cls.startsWith('!')).toBe(true);
  });

  it('the amount input takes its size from the helper, not a literal class', () => {
    expect(src).toMatch(/className=\{`mt-1\.5 mono-value \$\{amountFontSizeClass\(/);
  });
});
