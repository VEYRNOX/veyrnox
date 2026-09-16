// Max chip — precision and validity pin (#2593, Copilot review of #2589).
//
// The chip originally filled `String(effectiveBalance)`, and effectiveBalance is
// a parseFloat of the balance string. Two defects followed:
//   1. precision — a long fractional token balance was rounded before it reached
//      the amount field, so "Max" could under-send;
//   2. validity  — String() emits exponent notation for small numbers, and
//      isFormAmountWellFormed REJECTS exponent notation, so tapping Max on a
//      balance like 0.00000001 left the form unsubmittable with no explanation.
//
// Source scan rather than a render test: SendCrypto is ~3k lines and pulls in the
// whole provider stack, and the chip is ERC-20-only so a render test would need a
// token wallet fixture to reach it at all. The behavioural half (what the
// predicate accepts) is a real unit test below.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isFormAmountWellFormed } from '../SendCrypto.jsx';

const here = dirname(fileURLToPath(import.meta.url));
// Strip comments so a pin can never be satisfied by the prose describing it.
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('SendCrypto — Max chip', () => {
  it('derives maxAmountString from the balance STRING, never from effectiveBalance', () => {
    const decl = src.match(/const\s+maxAmountString\s*=[\s\S]*?;\n/);
    expect(decl, 'maxAmountString must exist').toBeTruthy();
    // The whole point: no parseFloat round-trip anywhere in the derivation.
    expect(decl[0]).not.toMatch(/effectiveBalance/);
    expect(decl[0]).not.toMatch(/parseFloat/);
    // Mirrors the same three branches the balance line renders.
    expect(decl[0]).toMatch(/String\(demoBalance/);
    expect(decl[0]).toMatch(/String\(nativeLiveBalance\)/);
    expect(decl[0]).toMatch(/String\(selectedWallet\?\.balance/);
  });

  it('gates the chip on the predicate, so an unusable value hides it', () => {
    expect(src).toMatch(
      /const\s+maxAmountUsable\s*=\s*isFormAmountWellFormed\(maxAmountString\)\s*;/,
    );
    // Render condition must consult maxAmountUsable, not a bare > 0 check.
    const chip = src.match(/amountMode === 'crypto' && isErc20 &&[^\n]*/);
    expect(chip, 'Max chip render condition must exist').toBeTruthy();
    expect(chip[0]).toMatch(/maxAmountUsable/);
    expect(chip[0]).not.toMatch(/effectiveBalance/);
  });

  it('assigns maxAmountString verbatim on tap', () => {
    expect(src).toMatch(/setAmount\(maxAmountString\)/);
    expect(src).not.toMatch(/setAmount\(String\(effectiveBalance\)\)/);
  });

  it('is the exact class of value the predicate accepts and rejects', () => {
    // A long exact token balance survives verbatim...
    expect(isFormAmountWellFormed('12.345678901234567890')).toBe(true);
    expect(isFormAmountWellFormed('0.00000001')).toBe(true);
    // ...while the exponent form the old code produced does not, which is why
    // the chip must hide rather than fill it.
    expect(String(parseFloat('0.00000001'))).toBe('1e-8');
    expect(isFormAmountWellFormed('1e-8')).toBe(false);
    expect(isFormAmountWellFormed(String(parseFloat('0.00000001')))).toBe(false);
  });
});
