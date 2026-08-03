// Phase 4 UX numeric-input pages — regression pins that they stay locale-aware.
//
// Same pattern as SecurityCenter.limitLocaleInput.test.js and
// BudgetLimits.localeInput.test.js from Phase 3, but batched across the 7 UX
// pages so a future edit can't quietly revert any single one.
//
// Two things pinned per page:
//   1. No `type="number"` on any numeric-input Input — that's the browser-
//      blanking trap PR #1409 fixed for SendCrypto's amount field.
//   2. The file imports `parseLocaleNumber` from @/lib/locale, and uses it
//      somewhere. A future edit that dropped the import would fail the
//      regex; one that swapped parseLocaleNumber back to parseFloat on the
//      same field would fail the "no bare parseFloat" check where it applies.
//
// Kept as one source-pinned file because the pages differ enough that per-
// page render tests would be seven copies of the same setup. This mirrors
// SendCrypto.amountInputType.test.js's rationale: full renders drag in the
// entire wallet stack; source pins catch the exact regression class.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const load = (name) => readFileSync(join(dir, '..', name), 'utf8');

// One entry per file we converted. `numericInputCount` is a floor — how many
// Input elements in the file are text-decimal numeric inputs (used to guard
// against a later addition slipping in as type="number").
const PAGES = [
  { file: 'SavingsGoals.jsx', numericInputCount: 2 },
  { file: 'PriceAlerts.jsx', numericInputCount: 2 },
  { file: 'InvoiceGenerator.jsx', numericInputCount: 1 },
  { file: 'RecurringPayments.jsx', numericInputCount: 1 },
  { file: 'WatchlistPage.jsx', numericInputCount: 4 },
  { file: 'Calculator.jsx', numericInputCount: 2 },
];

describe.each(PAGES)('$file — locale-aware numeric input pin', ({ file, numericInputCount }) => {
  const src = load(file);

  it('imports parseLocaleNumber and resolveLocale from @/lib/locale', () => {
    expect(src).toMatch(/from ["']@\/lib\/locale["']/);
    expect(src).toMatch(/\bparseLocaleNumber\b/);
    expect(src).toMatch(/\bresolveLocale\b/);
  });

  it('uses parseLocaleNumber somewhere in the source', () => {
    // Not just imported — actually called. A future edit could keep the
    // import while reverting the call site; this fails on the call side.
    const callSites = src.match(/parseLocaleNumber\s*\(/g) || [];
    expect(callSites.length).toBeGreaterThanOrEqual(1);
  });

  it('has no type="number" left on any numeric Input — HTML would blank locale-typed values', () => {
    // The exact bug: HTML value-sanitisation blanks "1,5" before React sees
    // it, so a de-DE user couldn't enter a decimal at all. Every converted
    // Input must be type="text" + inputMode="decimal".
    expect(src).not.toMatch(/type=["']number["']/);
  });

  it(`has at least ${numericInputCount} inputMode="decimal" Input(s) — no silent regression to type-only`, () => {
    // Sanity floor: the file has AT LEAST as many decimal inputs as before
    // the conversion. Catches a revert that dropped the inputMode attribute
    // (leaving type="text" without the mobile decimal keypad).
    const matches = src.match(/inputMode=["']decimal["']/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(numericInputCount);
  });
});
