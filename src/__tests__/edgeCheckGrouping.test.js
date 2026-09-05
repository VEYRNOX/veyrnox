// scripts/check-edge-endpoints.mjs — group classification.
//
// The script's verdict is only observable by redeploying, and a decision nobody
// can check is a decision nobody checks. classifyResults() is the whole rule,
// extracted pure so it can be asserted here without a deployment.
//
// WHAT THIS PROTECTS. `okx-candles` was individually REQUIRED, so an OKX outage
// redded `staging-gate` — a required merge gate — while `klines` and
// `coingecko` were serving the same candles. That happened on 52e3e05f
// (2026-08-07), 35d85509 (2026-08-08) and twice on 2026-09-05.
//
// The risk in fixing it is over-correcting into a check that can never fail.
// The 2026-08-06 incident the script was written for — every chart source 502
// with nothing surfacing it — MUST still go red. Both directions are pinned
// below; the all-down case is the one that matters most.

import { describe, it, expect } from 'vitest';
import { classifyResults } from '../../scripts/check-edge-endpoints.mjs';

const CHART = 'chart-data';
const ok = (name, group) => ({ name, problem: null, group });
const bad = (name, group, problem = 'HTTP 502 (expected 200)') => ({ name, problem, group });

describe('edge-check group classification', () => {
  it('a failing source is WARN while a sibling still serves', () => {
    // The exact production shape on 2026-09-05: OKX down, coingecko serving.
    const { verdicts, failed, advisory, degradedGroups } = classifyResults([
      bad('okx-candles (chart primary)', CHART),
      ok('coingecko (chart fallback)', CHART),
    ]);
    expect(verdicts.find((v) => v.name.startsWith('okx')).level).toBe('warn');
    expect(failed).toBe(0);
    expect(advisory).toBe(1);
    expect(degradedGroups).toEqual([CHART]);
  });

  it('every source down fails the run — the 2026-08-06 incident', () => {
    // The regression that would make this whole change a mistake. If this ever
    // goes green, the check has been turned into decoration.
    const { failed, degradedGroups } = classifyResults([
      bad('okx-candles (chart primary)', CHART),
      bad('klines (legacy, shipped clients)', CHART),
      bad('coingecko (chart fallback)', CHART),
    ]);
    expect(failed).toBe(3);
    // Nothing is "degraded" when nothing is serving — it is down.
    expect(degradedGroups).toEqual([]);
  });

  it('one surviving source is enough, whichever one it is', () => {
    // Guards against the rule accidentally privileging the primary.
    for (const survivor of ['okx-candles', 'klines', 'coingecko']) {
      const rows = ['okx-candles', 'klines', 'coingecko'].map((n) =>
        n === survivor ? ok(n, CHART) : bad(n, CHART)
      );
      const { failed } = classifyResults(rows);
      expect(failed, `${survivor} alone should keep the group green`).toBe(0);
    }
  });

  it('an ungrouped REQUIRED check still fails on its own', () => {
    // `okx-candles rejects a bad instId` is input validation, not a data
    // source — it proves something no other check proves, so it must not
    // inherit group leniency. Mutation defence: give it a group and this reds.
    const { failed, verdicts } = classifyResults([
      ok('okx-candles (chart primary)', CHART),
      { name: 'okx-candles rejects a bad instId', problem: 'HTTP 200 (expected 400)', required: true },
    ]);
    expect(failed).toBe(1);
    expect(verdicts.find((v) => v.name.includes('bad instId')).level).toBe('fail');
  });

  it('an ungrouped advisory check still only warns', () => {
    const { failed, advisory } = classifyResults([
      { name: 'something advisory', problem: 'flaky', required: false },
    ]);
    expect(failed).toBe(0);
    expect(advisory).toBe(1);
  });

  it('all-passing input produces no failures and no degraded groups', () => {
    // Vacuity guard: if classifyResults ever returned empty verdicts, the
    // assertions above would pass while proving nothing.
    const { verdicts, failed, advisory, degradedGroups } = classifyResults([
      ok('okx-candles (chart primary)', CHART),
      ok('coingecko (chart fallback)', CHART),
      { name: 'okx-candles rejects a bad instId', problem: null, required: true },
    ]);
    expect(verdicts).toHaveLength(3);
    expect(verdicts.every((v) => v.level === 'ok')).toBe(true);
    expect(failed).toBe(0);
    expect(advisory).toBe(0);
    expect(degradedGroups).toEqual([]);
  });
});

describe('edge-check config — the real CHECKS array keeps its shape', () => {
  it('the bad-instId validation check is REQUIRED and ungrouped', async () => {
    // Reads the source rather than the array (CHECKS is module-private). Scoped
    // to the structural form so it cannot pass against a comment mentioning it.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'scripts/check-edge-endpoints.mjs'), 'utf8');
    const block = src.match(/name: 'okx-candles rejects a bad instId',[\s\S]*?\},/);
    expect(block, 'bad-instId check not found').toBeTruthy();
    const body = block[0].split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(body).toContain('required: true');
    expect(body).not.toContain('group:');
  });
});
