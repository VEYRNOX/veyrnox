// src/notify/__tests__/useReceiveDetector.test.js
//
// PR-275: useReceiveDetector — receive-detection delta logic + structural guards.
//
// The hook itself requires a React render harness (not available in this project).
// Instead we test:
//   (1) detectDeltas() — the pure helper that encodes the I4 null-skip rule and
//       the MIN_DELTA noise floor. This is the entire per-poll decision function;
//       if it's correct the hook is correct.
//   (2) Source-scan guards for I3 (deniability-mode gate, active-set-only reads)
//       and I4 (null guard in both the helper and the hook body) present in code.

import { describe, it, expect } from 'vitest';
import { detectDeltas } from '../useReceiveDetector.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../useReceiveDetector.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

// ── detectDeltas pure logic ───────────────────────────────────────────────────

describe('detectDeltas — pure delta helper', () => {
  it('prior=null → empty (baseline run, no emit)', () => {
    expect(detectDeltas(null, { ETH: 1.0 }, ['ETH'])).toEqual([]);
  });

  it('positive delta → returns entry with symbol, delta, amount string', () => {
    const results = detectDeltas({ ETH: 1.0 }, { ETH: 1.5 }, ['ETH']);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('ETH');
    expect(results[0].delta).toBeCloseTo(0.5);
    expect(results[0].amount).toMatch(/0\.500000 ETH/);
  });

  it('zero delta → empty', () => {
    expect(detectDeltas({ ETH: 1.0 }, { ETH: 1.0 }, ['ETH'])).toEqual([]);
  });

  it('negative delta (send) → empty', () => {
    expect(detectDeltas({ ETH: 1.0 }, { ETH: 0.5 }, ['ETH'])).toEqual([]);
  });

  it('I4: null prior value → skip that symbol (indeterminate baseline)', () => {
    expect(detectDeltas({ ETH: null }, { ETH: 1.0 }, ['ETH'])).toEqual([]);
  });

  it('I4: null current value → skip that symbol (failed read)', () => {
    expect(detectDeltas({ ETH: 1.0 }, { ETH: null }, ['ETH'])).toEqual([]);
  });

  it('I4: both null → skip', () => {
    expect(detectDeltas({ ETH: null }, { ETH: null }, ['ETH'])).toEqual([]);
  });

  it('multi-asset: only the asset with a positive delta is returned', () => {
    const prior = { ETH: 1.0, BTC: 0.01 };
    const current = { ETH: 1.0, BTC: 0.02 };
    const results = detectDeltas(prior, current, ['ETH', 'BTC']);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('BTC');
  });

  it('multi-asset: multiple positive deltas → multiple entries', () => {
    const prior = { ETH: 1.0, SOL: 10.0 };
    const current = { ETH: 1.5, SOL: 11.0 };
    const results = detectDeltas(prior, current, ['ETH', 'SOL']);
    expect(results).toHaveLength(2);
  });

  it('multi-asset: one null among others does not suppress the healthy ones', () => {
    const prior = { ETH: 1.0, BTC: 0.01 };
    const current = { ETH: null, BTC: 0.02 }; // ETH read failed
    const results = detectDeltas(prior, current, ['ETH', 'BTC']);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('BTC');
  });

  it('symbols not present in either snapshot are skipped cleanly', () => {
    expect(detectDeltas({}, {}, ['ETH'])).toEqual([]);
  });

  it('sub-MIN_DELTA noise is not emitted', () => {
    // 1e-10 is below the 1e-9 floor
    expect(detectDeltas({ ETH: 1.0 }, { ETH: 1.0 + 1e-10 }, ['ETH'])).toEqual([]);
  });
});

// ── structural guards (source scan) ──────────────────────────────────────────

describe('useReceiveDetector structural guards (source scan)', () => {
  it('I3: polls only when isUnlocked && !isDecoy && !isHidden', () => {
    expect(code).toMatch(/isDecoy/);
    expect(code).toMatch(/isHidden/);
    expect(code).toMatch(/isUnlocked/);
    // The guard must appear in the hook body before the fetchAssetAmount *call*.
    // Search in the hook section only (after 'export function useReceiveDetector').
    const hookSection = code.slice(code.indexOf('export function useReceiveDetector'));
    const guardIdx = hookSection.indexOf('isDecoy');
    const fetchCallIdx = hookSection.indexOf('fetchAssetAmount(');
    expect(guardIdx).toBeLessThan(fetchCallIdx);
  });

  it('I3: reads from active wallet only (activeWalletId, not all wallets)', () => {
    expect(code).toMatch(/activeWalletId/);
    // Must find the active wallet by ID, not iterate all wallets freely.
    expect(code).toMatch(/find\s*\(\s*\(w\)\s*=>/);
  });

  it('I4: null guard in detectDeltas (indeterminate reads skipped)', () => {
    // The null guard must appear in the helper.
    const helperSection = src.slice(src.indexOf('export function detectDeltas'), src.indexOf('export function useReceiveDetector'));
    expect(helperSection).toMatch(/== null/);
  });

  it('I4: emitReceiveDetected call is wrapped in try/catch', () => {
    expect(code).toMatch(/try\s*\{[\s\S]*?emitReceiveDetected/);
  });

  it('baseline is wiped on lock / deniability entry (priorRef.current = null)', () => {
    // The assignment must happen inside the early-return guard.
    const guardBlock = src.slice(src.indexOf('if (!isUnlocked'), src.indexOf('const activeWallet'));
    expect(guardBlock).toMatch(/priorRef\.current\s*=\s*null/);
  });
});
