// SendCrypto — the amount field must not let the browser eat malformed input.
//
// THE BUG. PR #1409 added a 'malformed' error kind so that pressing Continue on
// "1,5" / "1.2.3" / "1." explains itself instead of dead-ending. But the input was
// `type="number"`, and the HTML value-sanitisation algorithm blanks any value that
// is not a "valid floating-point number" BEFORE React sees it. Probed in this
// project's own jsdom with a controlled number input:
//
//   '1e-8' -> '1e-8'    '.5' -> '.5'    '0.5' -> '0.5'      (reach state)
//   '1,5'  -> ''        '1.2.3' -> ''   '1.' -> ''   'abc' -> ''   (blanked)
//
// So four of the seven MALFORMED fixtures could never reach the form. A user typing
// "1,5" got "Amount is required" over a visibly non-empty field — a different lie
// from the one that was fixed. Only exponent notation ever reached the new copy.
//
// THE FIX. `type="text"` + `inputMode="decimal"` keeps the mobile decimal keypad
// (the reason type=number was there) while preserving the raw string, so
// isFormAmountWellFormed and sendAmountErrorKind judge what the user actually typed.
// The authoritative rejection has always been in JS — the UA type was never the
// guard — so widening what reaches the validators strengthens nothing and weakens
// nothing about the send gate.
//
// THE CONSEQUENCE THIS PINS. Letting malformed strings reach state means the raw
// parseFloat is now reachable by values it mis-reads: parseFloat('1,5') === 1, and
// Number('1.') === 1. Three derived displays would then assert a figure the user
// never typed — the "≈ $X" USD preview, the spend-limit banner and the
// insufficient-balance banner. They are gated on the SAME well-formedness verdict
// the Continue button uses, so a half-typed "1." cannot pop a limit warning.
//
// Pinned by SOURCE, not render: a full render of SendCrypto requires the entire
// send stack, which this codebase pins by source per SendCrypto.confirmation.test.js
// and SendCrypto.deniability.test.jsx.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isFormAmountWellFormed } from '../SendCrypto.jsx';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

// The amount <Input …> element, from its id to the closing bracket, with `//`
// comment lines stripped. The comments in that block necessarily DISCUSS
// type="number" — pinning against the raw slice would match the prose explaining
// why it is gone, so these assertions must see attributes only.
function amountInputBlock() {
  const start = src.indexOf('id="send-amount"');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('/>', start);
  expect(end).toBeGreaterThan(start);
  return src
    .slice(start, end)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('SendCrypto amount input — malformed values must reach the validators', () => {
  it('is not type="number", which would blank them before React sees them', () => {
    expect(amountInputBlock()).not.toMatch(/type="number"/);
  });

  it('is type="text" so the raw string survives', () => {
    expect(amountInputBlock()).toMatch(/type="text"/);
  });

  it('keeps inputMode="decimal" for the mobile decimal keypad', () => {
    // This was the whole reason type="number" was chosen; losing it would trade
    // one real UX regression for the fix.
    expect(amountInputBlock()).toMatch(/inputMode="decimal"/);
  });

  it('drops min/step, which are inert on a text input', () => {
    // Leaving them would imply a UA constraint that no longer applies.
    const block = amountInputBlock();
    expect(block).not.toMatch(/\bmin="0"/);
    expect(block).not.toMatch(/\bstep="any"/);
  });

  // The four fixtures that could not previously reach the form. Their being
  // rejected by the predicate is what produces the 'malformed' message — that is
  // the whole point of letting them through.
  it('the predicate still rejects everything the browser used to swallow', () => {
    for (const v of ['1,5', '1.2.3', '1.', 'abc']) {
      expect(isFormAmountWellFormed(v)).toBe(false);
    }
  });

  it('and still accepts what a user legitimately types', () => {
    for (const v of ['1', '0.5', '.5', '123.456']) {
      expect(isFormAmountWellFormed(v)).toBe(true);
    }
  });
});

describe('SendCrypto derived displays — gated on the same verdict as Continue', () => {
  // parseFloat('1,5') === 1 and Number('1.') === 1. Any derived display fed the raw
  // parse would assert a figure the user never typed, now that these strings can
  // reach state at all.
  it('parseFloat/Number really do mis-read the newly-reachable values', () => {
    expect(parseFloat('1,5')).toBe(1);
    expect(Number('1.')).toBe(1);
  });

  it('derives a display-only amount that is NaN unless well-formed', () => {
    expect(src).toMatch(/const\s+usableAmountNum\s*=/);
  });

  it('feeds the USD preview from the gated value, not the raw parse', () => {
    const line = src.split('\n').find((l) => l.includes('const amountUsd'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/usableAmountNum/);
    expect(line).not.toMatch(/\bamountNum\b(?!.*usable)/);
  });

  it('gates the spend-limit and insufficient-balance banners on it too', () => {
    // Both used `parseFloat(amount) > 0` directly, which "1." satisfies.
    expect(src).not.toMatch(/\{limitEval\.blocked && parseFloat\(amount\) > 0/);
    expect(src).not.toMatch(/\{balanceKnown && parseFloat\(amount\) > 0/);
  });

  it('still hands sendAmountErrorKind the HONEST parseFloat', () => {
    // amountNum must stay the raw parse there: isFormAmountWellFormed('0') is
    // false, so a gated value would turn "0" into 'malformed' and lose the more
    // specific "Amount must be greater than zero".
    const block = src.slice(src.indexOf('sendAmountErrorKind({'));
    expect(block.slice(0, 300)).toMatch(/amountNum,/);
  });
});
