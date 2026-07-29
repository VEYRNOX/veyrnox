// SecurityCenter — spend-limit inputs must be locale-aware AND well-formed.
//
// Two regression pins in one file (same shape as SendCrypto.amountInputType):
//
// 1. The Input elements are type="text" + inputMode="decimal", NOT type="number".
//    The HTML value-sanitisation algorithm blanks anything that is not a "valid
//    floating-point number" BEFORE React sees it — so a de-DE user typing "1,5"
//    into a type="number" limit field saw the field appear empty and couldn't
//    save at all. Same trap PR #1409 fixed for SendCrypto's amount input; this
//    pin keeps the same fix from getting reverted here.
//
// 2. The save mutation feeds `parseLocaleNumber(...)` — NOT bare `parseFloat`.
//    A caller who dropped back to parseFloat would silently truncate en-US
//    "1,5" to 1 and save a $1 limit instead of $1.5. parseLocaleNumber
//    returns NaN for that case so the onError toast fires.
//
// Pinned by SOURCE (fs.readFileSync), not render — same pattern as
// SendCrypto.amountInputType.test.js; a full render pulls in the entire
// TransactionLimit / RASP / wallet stack, which the amountInputType file
// notes is unnecessary for pinning behaviour that lives in the source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SecurityCenter.jsx'), 'utf8');

// The two limit-input blocks. Grab from the `Daily Limit (USD)` label through
// the next `/>`, and same for `Per Transaction Limit (USD)`. Comment lines
// stripped so the assertions see attributes only (the fix's own comment
// necessarily discusses `type="number"`).
function limitInputBlock(labelText) {
  const labelIdx = src.indexOf(labelText);
  expect(labelIdx).toBeGreaterThan(-1);
  const inputStart = src.indexOf('<Input ', labelIdx);
  expect(inputStart).toBeGreaterThan(-1);
  const inputEnd = src.indexOf('/>', inputStart);
  expect(inputEnd).toBeGreaterThan(inputStart);
  return src.slice(inputStart, inputEnd)
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('SecurityCenter — Daily Limit input', () => {
  const block = () => limitInputBlock('Daily Limit (USD)');

  it('is NOT type="number" — that would let the browser blank de-DE "1,5"', () => {
    expect(block()).not.toMatch(/type="number"/);
  });

  it('is type="text" so the raw locale-typed string survives', () => {
    expect(block()).toMatch(/type="text"/);
  });

  it('keeps inputMode="decimal" for the mobile decimal keypad', () => {
    // Same rationale as SendCrypto: this is the reason type="number" was
    // there originally, and losing it would trade one UX loss for the fix.
    expect(block()).toMatch(/inputMode="decimal"/);
  });
});

describe('SecurityCenter — Per Transaction Limit input', () => {
  const block = () => limitInputBlock('Per Transaction Limit (USD)');

  it('is NOT type="number"', () => {
    expect(block()).not.toMatch(/type="number"/);
  });

  it('is type="text" + inputMode="decimal"', () => {
    expect(block()).toMatch(/type="text"/);
    expect(block()).toMatch(/inputMode="decimal"/);
  });
});

describe('SecurityCenter — save handler parses locale-aware, not raw parseFloat', () => {
  it('imports parseLocaleNumber and resolveLocale from @/lib/locale', () => {
    // Direct grep — the import is a stable anchor; a future refactor that
    // dropped the import would also break the mutation body below.
    expect(src).toMatch(/from ["']@\/lib\/locale["']/);
    expect(src).toMatch(/\bparseLocaleNumber\b/);
    expect(src).toMatch(/\bresolveLocale\b/);
  });

  it('the addLimit mutationFn passes daily/perTx through parseLocaleNumber', () => {
    // Extract the addLimit mutation body (up to onSuccess) and check both
    // inputs are canonicalised before being written to the entity.
    const mutStart = src.indexOf('const addLimit = useMutation');
    expect(mutStart).toBeGreaterThan(-1);
    const successIdx = src.indexOf('onSuccess', mutStart);
    expect(successIdx).toBeGreaterThan(mutStart);
    const body = src.slice(mutStart, successIdx);
    // Two parseLocaleNumber calls (one per limit field), and NO bare
    // parseFloat(dailyLimit) / parseFloat(perTxLimit) calls that would
    // bypass the locale layer.
    expect(body).toMatch(/parseLocaleNumber\(\s*dailyLimit\b/);
    expect(body).toMatch(/parseLocaleNumber\(\s*perTxLimit\b/);
    expect(body).not.toMatch(/parseFloat\(\s*dailyLimit\b/);
    expect(body).not.toMatch(/parseFloat\(\s*perTxLimit\b/);
  });

  it('surfaces a user-visible error on invalid input (onError → toast)', () => {
    // A caller that only THROWS without an onError would silently discard
    // the failure — the user would tap Save and nothing would happen. Pin
    // that an onError handler exists on the addLimit mutation.
    const mutStart = src.indexOf('const addLimit = useMutation');
    // Bound by the NEXT top-level `const ` declaration (there's more than
    // one `});` inside — one closes the `.create({...})` call).
    const nextConst = src.indexOf('\n  const ', mutStart + 1);
    expect(nextConst).toBeGreaterThan(mutStart);
    const body = src.slice(mutStart, nextConst);
    expect(body).toMatch(/onError:/);
    expect(body).toMatch(/toast\.error/);
  });
});
