// FeeSelector — custom-fee inputs must be locale-aware AND well-formed
// BEFORE they reach wallet-core's buildEvmCustomFee (which calls parseUnits
// under the hood; parseUnits throws on a locale comma).
//
// Two pin categories:
//
// 1. INTEGRATION composition — normalizeDecimalInput('1,5', 'de-DE') → '1.5'
//    round-trips through buildEvmCustomFee without throwing, and produces the
//    same fee as the ASCII '1.5' equivalent. This is what the FeeSelector
//    call site relies on.
//
// 2. SOURCE pin on FeeSelector.jsx — the two gwei inputs are NOT type="number"
//    (would blank de-DE '1,5' before React sees it), and the file imports
//    normalizeDecimalInput and calls it. Same shape as the Phase 3 / Phase 4
//    source pins on SecurityCenter / BudgetLimits / UX pages.
//
// The wallet-core file (evm/fees.js) is UNCHANGED by this PR — it stays
// ASCII-strict (which is correct; buildEvmCustomFee is a signing-side leaf).
// The locale layer sits in the UI caller, so the strict predicate downstream
// still catches anything that isn't a plain decimal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildEvmCustomFee } from '../../wallet-core/evm/fees.js';
import { normalizeDecimalInput } from '../../lib/locale.js';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../FeeSelector.jsx'), 'utf8');

describe('FeeSelector composition — normalizeDecimalInput → buildEvmCustomFee', () => {
  const base = { gasLimit: 21000, networkKey: 'ethereum' };

  it('the bug this closes: raw de-DE "1,5" makes buildEvmCustomFee throw', () => {
    // Proves the current pre-normalisation call site is broken for anyone
    // who types a locale comma in the priority field. Documents the failure
    // mode this PR fixes at the caller layer.
    expect(() =>
      buildEvmCustomFee({ ...base, maxBaseFeeGwei: '1', priorityGwei: '1,5' })
    ).toThrow();
  });

  it('normalizeDecimalInput("1,5","de-DE") → buildEvmCustomFee succeeds', () => {
    const priority = normalizeDecimalInput('1,5', 'de-DE');
    expect(priority).toBe('1.5');
    // Same call, canonicalised input, works.
    const fee = buildEvmCustomFee({ ...base, maxBaseFeeGwei: '1', priorityGwei: priority });
    expect(fee.maxPriorityFeePerGasWei).toBe('1500000000'); // 1.5 gwei in wei
  });

  it('en-US "1.5" and de-DE "1,5" (canonicalised per locale) produce identical fees', () => {
    // Locale-equivalence: same VALUE typed in either locale MUST produce the
    // same signed fee. Anything else is a silent divergence between what the
    // user typed and what got signed.
    const feeUs = buildEvmCustomFee({
      ...base,
      maxBaseFeeGwei: normalizeDecimalInput('20', 'en-US'),
      priorityGwei: normalizeDecimalInput('1.5', 'en-US'),
    });
    const feeDe = buildEvmCustomFee({
      ...base,
      maxBaseFeeGwei: normalizeDecimalInput('20', 'de-DE'),
      priorityGwei: normalizeDecimalInput('1,5', 'de-DE'),
    });
    expect(feeUs.maxFeePerGasWei).toBe(feeDe.maxFeePerGasWei);
    expect(feeUs.maxPriorityFeePerGasWei).toBe(feeDe.maxPriorityFeePerGasWei);
  });
});

describe('FeeSelector source — inputs stay locale-safe', () => {
  // Grab the block around each gwei Input by id. Comment lines stripped.
  function inputBlock(id) {
    const idIdx = src.indexOf(`id="${id}"`);
    expect(idIdx).toBeGreaterThan(-1);
    const inputStart = src.lastIndexOf('<Input', idIdx);
    expect(inputStart).toBeGreaterThan(-1);
    const inputEnd = src.indexOf('/>', idIdx);
    expect(inputEnd).toBeGreaterThan(idIdx);
    return src.slice(inputStart, inputEnd)
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  }

  it('Max base (Gwei) input is NOT type="number"', () => {
    expect(inputBlock('fee-custom-maxbase')).not.toMatch(/type="number"/);
  });

  it('Priority (Gwei) input is NOT type="number"', () => {
    expect(inputBlock('fee-custom-priority')).not.toMatch(/type="number"/);
  });

  it('Both Gwei inputs keep inputMode="decimal"', () => {
    expect(inputBlock('fee-custom-maxbase')).toMatch(/inputMode="decimal"/);
    expect(inputBlock('fee-custom-priority')).toMatch(/inputMode="decimal"/);
  });

  it('imports normalizeDecimalInput + resolveLocale from @/lib/locale', () => {
    expect(src).toMatch(/from ["']@\/lib\/locale["']/);
    expect(src).toMatch(/\bnormalizeDecimalInput\b/);
    expect(src).toMatch(/\bresolveLocale\b/);
  });

  it('normalizes gwei inputs BEFORE passing to buildEvmCustomFee', () => {
    // A caller that still did `maxBaseFeeGwei: custom.maxBaseFeeGwei || "0"`
    // would keep the current bug. Pin that the raw field is not passed
    // directly at either call site (the useEffect emit AND the customPreview
    // useMemo — both invoke buildEvmCustomFee).
    const buildCalls = [...src.matchAll(/buildEvmCustomFee\(\{[^}]*\}/gs)];
    expect(buildCalls.length).toBeGreaterThanOrEqual(2);
    for (const m of buildCalls) {
      const block = m[0];
      // The raw field access `custom.maxBaseFeeGwei` should NOT appear as
      // the value of maxBaseFeeGwei in a buildEvmCustomFee call — a
      // normalised local variable should.
      expect(block).not.toMatch(/maxBaseFeeGwei:\s*custom\.maxBaseFeeGwei/);
      expect(block).not.toMatch(/priorityGwei:\s*custom\.priorityGwei/);
    }
  });
});
