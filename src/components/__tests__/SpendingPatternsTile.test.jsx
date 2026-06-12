// components/__tests__/SpendingPatternsTile.test.jsx
//
// Tests for the PRESENTATIONAL Spending Patterns tile (brief §6 tests 5–8). The
// tile is a pure function of props ("props in, chart out" — no data fetching, no
// hooks), so — like landing-guard.test.jsx — we invoke it directly and inspect
// the returned React element tree (the committed vitest.config has no
// plugin-react, so JSX uses the classic React.createElement runtime).
//
// The honesty properties under test:
//   - Fail closed (I4): an `indeterminate` status renders the honest "unavailable"
//     state, NEVER a zero-valued chart. `empty` is a distinct honest state.
//   - No fiat: only native crypto amounts appear; no USD, no "$".
//   - Deniability parity (D2/D3): real-mode and decoy-mode renders of
//     equivalent-shaped history produce STRUCTURALLY IDENTICAL trees; no element
//     appears in only one mode.
//   - No disk write (option-1 boundary guard): a full aggregate + render touches
//     no persistence layer. This is what keeps the tile from silently becoming
//     the HONEST-DISABLED-until-audit persisted variant.
//   - Active-set scope (I3): the aggregation only ever emits from the active set's
//     own history; set-B data can never leak into set-A's tile.

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
globalThis.React = React;

import SpendingPatternsTile from '@/components/SpendingPatternsTile';
import { spendByPeriod } from '@/analytics/spendByPeriod';

const JUN = Date.UTC(2026, 5, 1);
const MAY = Date.UTC(2026, 4, 1);

const row = (over) => ({
  id: 'x', hash: 'x', type: 'send', status: 'confirmed',
  assetSymbol: 'BTC', amount: '0.5', timestamp: Date.UTC(2026, 5, 10), ...over,
});

// --- tree-walk helpers (no RTL; we read the returned element tree directly) ---

// Structural fingerprint: element tag/component name + data-testid + data-state,
// recursively — but NOT text or values. Two trees with the same fingerprint are
// structurally identical regardless of the figures shown (the parity property).
function shape(node) {
  if (node == null || typeof node !== 'object') return null; // text/number/bool ignored
  const t = typeof node.type === 'string' ? node.type : node.type?.name || 'Component';
  const children = React.Children.toArray(node.props?.children).map(shape).filter(Boolean);
  return {
    t,
    testid: node.props?.['data-testid'] ?? null,
    state: node.props?.['data-state'] ?? null,
    children,
  };
}

function testids(node, out = []) {
  if (node == null || typeof node !== 'object') return out;
  if (node.props?.['data-testid']) out.push(node.props['data-testid']);
  React.Children.toArray(node.props?.children).forEach((c) => testids(c, out));
  return out;
}

function texts(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') return (out.push(String(node)), out);
  if (typeof node !== 'object') return out;
  React.Children.toArray(node.props?.children).forEach((c) => texts(c, out));
  return out;
}

describe('SpendingPatternsTile — fail-closed states (I4)', () => {
  it('renders the honest "unavailable" state for indeterminate — never a zero chart', () => {
    const out = SpendingPatternsTile({ status: 'indeterminate', buckets: [], granularity: 'month', assetSymbol: 'ETH' });
    expect(out.props['data-state']).toBe('indeterminate');
    const ids = testids(out);
    expect(ids).toContain('spend-indeterminate');
    expect(ids).not.toContain('spend-bar'); // no fabricated/zero-filled bars
    const txt = texts(out).join(' ').toLowerCase();
    expect(txt).toMatch(/unavailable|can.t be read/);
    expect(texts(out)).not.toContain('0'); // no fabricated zero figure
  });

  it('renders a distinct honest "empty" state when there are genuinely no sends', () => {
    const out = SpendingPatternsTile({ status: 'empty', buckets: [], granularity: 'month', assetSymbol: 'BTC' });
    expect(out.props['data-state']).toBe('empty');
    expect(testids(out)).toContain('spend-empty');
    expect(testids(out)).not.toContain('spend-bar');
  });
});

describe('SpendingPatternsTile — ok render (native units, no fiat)', () => {
  const buckets = [
    { periodStart: MAY, byAsset: { BTC: '0.25' } },
    { periodStart: JUN, byAsset: { BTC: '0.5' } },
  ];

  it('renders one bar per period with native amounts and the asset symbol', () => {
    const out = SpendingPatternsTile({ status: 'ok', buckets, granularity: 'month', assetSymbol: 'BTC' });
    expect(out.props['data-state']).toBe('ok');
    expect(testids(out).filter((i) => i === 'spend-bar')).toHaveLength(2);
    const txt = texts(out).join(' ');
    expect(txt).toContain('0.5');
    expect(txt).toContain('0.25');
    expect(txt).toContain('BTC');
  });

  it('shows NO fiat anywhere (no "usd", no "$")', () => {
    const out = SpendingPatternsTile({ status: 'ok', buckets, granularity: 'month', assetSymbol: 'BTC' });
    const txt = texts(out).join(' ');
    expect(txt.toLowerCase()).not.toContain('usd');
    expect(txt).not.toContain('$');
  });
});

describe('SpendingPatternsTile — deniability parity (D2/D3)', () => {
  it('real-mode and decoy-mode renders of equivalent-shaped history are structurally identical', () => {
    const real = SpendingPatternsTile({
      status: 'ok', granularity: 'month', assetSymbol: 'BTC',
      buckets: [{ periodStart: MAY, byAsset: { BTC: '0.25' } }, { periodStart: JUN, byAsset: { BTC: '0.5' } }],
    });
    const decoy = SpendingPatternsTile({
      status: 'ok', granularity: 'month', assetSymbol: 'BTC',
      buckets: [{ periodStart: MAY, byAsset: { BTC: '0.01' } }, { periodStart: JUN, byAsset: { BTC: '0.02' } }],
    });
    // Same elements, testids and states at every node — only the figures differ.
    expect(shape(real)).toEqual(shape(decoy));
  });
});

describe('SpendingPatternsTile — option-1 boundary guard (no disk write)', () => {
  it('writes nothing to localStorage or IndexedDB across a full aggregate + render', () => {
    const lsSet = vi.spyOn(Storage.prototype, 'setItem');
    const idbOpen = vi.spyOn(indexedDB, 'open');
    const res = spendByPeriod({ supported: true, transactions: [row({ amount: '0.5' })] }, 'month');
    const out = SpendingPatternsTile({
      status: res.status, buckets: res.buckets, granularity: res.granularity, assetSymbol: 'BTC',
    });
    texts(out); // force a full traversal of the rendered tree
    expect(lsSet).not.toHaveBeenCalled();
    expect(idbOpen).not.toHaveBeenCalled();
    lsSet.mockRestore();
    idbOpen.mockRestore();
  });
});

describe('spendByPeriod — active-set scope (I3)', () => {
  it("only ever emits the active set's own history — set-B data never leaks into set-A", () => {
    const setA = { supported: true, transactions: [row({ assetSymbol: 'BTC', amount: '0.5', timestamp: JUN + 9 * 86400000 })] };
    const setB = { supported: true, transactions: [row({ assetSymbol: 'SOL', amount: '9.9', timestamp: JUN + 9 * 86400000 })] };
    const a = spendByPeriod(setA, 'month');
    const json = JSON.stringify(a);
    expect(json).toContain('BTC');
    expect(json).not.toContain('SOL'); // B's asset can never appear in A's result
    expect(json).not.toContain('9.9'); // B's magnitude can never appear in A's result
    // The reader itself (lib/txHistory.fetchAssetHistory) is parameterised by the
    // active set's address — its cross-set isolation is covered in txHistory tests.
    void setB;
  });
});
