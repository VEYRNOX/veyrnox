// components/__tests__/spendingQueryConfig.test.js
//
// The container's I2 guard — parallel to the tile's no-disk-write guard. The
// Spending Patterns card must NOT query the indexer until the user opens it
// (each history read discloses the active address + IP; lib/txHistory forbids
// background queries). The fetch gate is `enabled === expanded`, extracted as a
// pure function so this privacy property is testable without rendering hooks.

import { describe, it, expect } from 'vitest';
import { spendingQueryConfig } from '../spendingQueryConfig';

const base = { assetSymbol: 'BTC', address: 'tb1qabc', demo: false };

describe('spendingQueryConfig — on-demand fetch gate (I2)', () => {
  it('disables the query while the card is collapsed — no egress until opened', () => {
    // enabled:false → react-query never runs queryFn → the indexer is never hit.
    expect(spendingQueryConfig({ ...base, expanded: false }).enabled).toBe(false);
  });

  it('enables the query only once the user expands the card', () => {
    expect(spendingQueryConfig({ ...base, expanded: true }).enabled).toBe(true);
  });

  it('reuses cache on a re-expand within the window and never background-polls', () => {
    const c = spendingQueryConfig({ ...base, expanded: true });
    expect(c.staleTime).toBeGreaterThan(0);      // collapse→re-expand within window: cache, no re-egress
    expect(c.refetchOnWindowFocus).toBe(false);  // a user-opened snapshot, never a background poll
  });

  it('scopes the cache key to the active set (asset + address + mode) — no cross-set leak', () => {
    const a = spendingQueryConfig({ assetSymbol: 'BTC', address: 'addrA', demo: false, expanded: true });
    const b = spendingQueryConfig({ assetSymbol: 'BTC', address: 'addrB', demo: false, expanded: true });
    expect(a.queryKey).toContain('addrA');
    expect(b.queryKey).toContain('addrB');
    expect(a.queryKey).not.toEqual(b.queryKey); // a different active-set address → a different cache entry
  });
});
