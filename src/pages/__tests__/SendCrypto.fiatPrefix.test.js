// SendCrypto — in USD mode the "$" must stay visible while the user types.
// It used to live only in the placeholder "$0.00", so the first keystroke
// removed it. The value now renders fiatDisplay(fiatDraft) and onChange strips
// the prefix back off, so fiatDraft (and the crypto conversion) never sees "$".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fiatDisplay, stripFiatPrefix } from '../SendCrypto.jsx';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

describe('fiat amount "$" prefix', () => {
  it('shows "$" in front of any typed amount', () => {
    expect(fiatDisplay('12.5')).toBe('$12.5');
    expect(fiatDisplay('0')).toBe('$0');
  });

  it('shows nothing for an empty draft, so the placeholder is visible', () => {
    expect(fiatDisplay('')).toBe('');
  });

  it('strips the prefix from input, and round-trips', () => {
    expect(stripFiatPrefix('$12.5')).toBe('12.5');
    expect(stripFiatPrefix('$')).toBe('');
    expect(stripFiatPrefix('12.5')).toBe('12.5');
    expect(stripFiatPrefix(fiatDisplay('1,5'))).toBe('1,5');
  });

  it('the amount input renders fiatDisplay in fiat mode and strips on change', () => {
    const start = src.indexOf('id="send-amount"');
    const block = src.slice(start, src.indexOf('/>', start));
    expect(block).toContain("value={amountMode === 'fiat' ? fiatDisplay(fiatDraft) : amount}");
    expect(block).toContain('stripFiatPrefix(e.target.value)');
  });
});
