// BudgetLimits — the "Limit (native amount)" input must be locale-aware AND
// well-formed. Sibling pin to SecurityCenter.limitLocaleInput.test.js;
// exists for the same reasons, on a different page.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../BudgetLimits.jsx'), 'utf8');

function limitInputBlock() {
  // Anchor on the id, which is stable across refactors that might reword
  // labels or split components.
  const start = src.indexOf('id="budget-limit"');
  expect(start).toBeGreaterThan(-1);
  // Walk backwards to the opening `<Input`.
  const inputStart = src.lastIndexOf('<Input ', start);
  expect(inputStart).toBeGreaterThan(-1);
  const inputEnd = src.indexOf('/>', start);
  expect(inputEnd).toBeGreaterThan(start);
  return src.slice(inputStart, inputEnd)
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('BudgetLimits — Limit input', () => {
  it('is NOT type="number" — would blank de-DE "1,5" before React sees it', () => {
    expect(limitInputBlock()).not.toMatch(/type="number"/);
  });

  it('is type="text" + inputMode="decimal"', () => {
    expect(limitInputBlock()).toMatch(/type="text"/);
    expect(limitInputBlock()).toMatch(/inputMode="decimal"/);
  });
});

describe('BudgetLimits — save mutation is locale-aware', () => {
  it('imports parseLocaleNumber + resolveLocale from @/lib/locale', () => {
    expect(src).toMatch(/from ["']@\/lib\/locale["']/);
    expect(src).toMatch(/\bparseLocaleNumber\b/);
    expect(src).toMatch(/\bresolveLocale\b/);
  });

  it('the create mutationFn feeds limit_usd through parseLocaleNumber, not raw parseFloat', () => {
    const mutStart = src.indexOf('const create = useMutation');
    expect(mutStart).toBeGreaterThan(-1);
    const successIdx = src.indexOf('onSuccess', mutStart);
    expect(successIdx).toBeGreaterThan(mutStart);
    const body = src.slice(mutStart, successIdx);
    expect(body).toMatch(/parseLocaleNumber\([^)]*limit_usd/);
    // The existing `parseInt` on alert_at_percent stays — that field is an
    // integer % clamp, not a decimal amount. Only limit_usd must go through
    // the locale helper.
    expect(body).not.toMatch(/parseFloat\([^)]*limit_usd/);
  });

  it('keeps the existing positive-number gate — NaN from parseLocaleNumber must be refused', () => {
    // If a future edit drops `Number.isFinite(limit) || limit <= 0` while
    // keeping parseLocaleNumber, en-US "1,5" (which returns NaN) would flow
    // to base44.entities.BudgetLimit.create as NaN — the entity backend may
    // coerce or drop, either way silently wrong. Pin the gate.
    const mutStart = src.indexOf('const create = useMutation');
    const successIdx = src.indexOf('onSuccess', mutStart);
    const body = src.slice(mutStart, successIdx);
    expect(body).toMatch(/Number\.isFinite\(limit\)/);
    expect(body).toMatch(/limit\s*<=\s*0/);
  });
});
