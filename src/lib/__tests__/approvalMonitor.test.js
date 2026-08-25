// src/lib/__tests__/approvalMonitor.test.js
//
// Regression guards for two defects that shipped in #1897 and were latent only
// because nothing called startMonitor():
//
//   1. lookupThreatSync returns an ARRAY and `[]` is truthy, so `if (threat)`
//      was always true — every ordinary approval and every incoming transfer
//      raised a HIGH "flagged address" alert whose detail read "— undefined".
//      A security alert with a 100% false-positive rate is fake security.
//
//   2. getAlerts() returned a fresh array on every call, which
//      useSyncExternalStore compares with Object.is — an infinite render loop
//      the moment the hook was rendered.
//
// Both are asserted behaviourally, not by reading the implementation.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLookup = vi.fn();
vi.mock('@/lib/threatIntelStore', () => ({
  lookupThreatSync: (addr) => mockLookup(addr),
}));

let deniable = false;
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniable,
}));

/** Fresh module instance per test — the store is module-level state. */
async function loadModule() {
  vi.resetModules();
  return import('../approvalMonitor.js');
}

const APPROVAL = {
  spender_address: '0x1111111111111111111111111111111111111111',
  token_symbol: 'USDC',
  allowance_raw: '1000000',
  status: 'active',
};

/**
 * Start the monitor and wait for its first poll to finish. startMonitor's
 * initial poll is deliberately not awaited by the module, so settle on an
 * observable outcome rather than a fixed number of microtasks.
 * @param {number} expectedAlerts alert count the poll should produce
 */
async function runOnePoll(mod, { approvals = [], transfers = [] } = {}, expectedAlerts = 0) {
  mod.startMonitor({
    fetchApprovals: async () => approvals,
    fetchRecentTransfers: async () => transfers,
    intervalMs: 10_000_000, // effectively one poll; the immediate call is what we test
  });
  await vi.waitFor(() => expect(mockLookup).toHaveBeenCalled());
  await vi.waitFor(() => expect(mod.getAlerts()).toHaveLength(expectedAlerts));
}

beforeEach(() => {
  deniable = false;
  mockLookup.mockReset();
  mockLookup.mockReturnValue([]); // the real store's MISS value
});

describe('approvalMonitor — threat lookup unwrapping', () => {
  it('a clean spender raises NO flagged-address alert (empty array is not a hit)', async () => {
    const mod = await loadModule();
    await runOnePoll(mod, { approvals: [APPROVAL] }, 0);
    mod.stopMonitor();

    const flagged = mod.getAlerts().filter((a) => a.type === 'new_approval');
    expect(flagged).toEqual([]);
  });

  it('a clean incoming transfer raises NO alert', async () => {
    const mod = await loadModule();
    await runOnePoll(mod, {
      transfers: [{ from: '0x2222222222222222222222222222222222222222', symbol: 'ETH', value: '1' }],
    }, 0);
    mod.stopMonitor();

    expect(mod.getAlerts()).toEqual([]);
  });

  it('a real hit IS alerted, and its note comes from the first match', async () => {
    const mod = await loadModule();
    mockLookup.mockReturnValue([{ note: 'Lazarus-linked', category: 'hack', severity: 'critical' }]);
    await runOnePoll(mod, { approvals: [APPROVAL] }, 1);

    // Read BEFORE stopMonitor — stopping deliberately clears the alerts.
    const alerts = mod.getAlerts();
    mod.stopMonitor();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('high');
    expect(alerts[0].detail).toContain('Lazarus-linked');
    // The bug rendered the literal string "undefined" here.
    expect(alerts[0].detail).not.toContain('undefined');
  });

  it('an unlimited allowance to a clean spender is medium, not a flagged-address hit', async () => {
    const mod = await loadModule();
    await runOnePoll(mod, {
      approvals: [{ ...APPROVAL, allowance_raw: '0x' + 'f'.repeat(64) }],
    }, 1);

    const alerts = mod.getAlerts();
    mod.stopMonitor();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('unlimited_approval');
    expect(alerts[0].severity).toBe('medium');
  });
});

describe('approvalMonitor — snapshot stability (useSyncExternalStore contract)', () => {
  it('getAlerts returns the SAME reference when nothing changed', async () => {
    const mod = await loadModule();
    expect(mod.getAlerts()).toBe(mod.getAlerts());

    mockLookup.mockReturnValue([{ note: 'bad', category: 'scam', severity: 'high' }]);
    await runOnePoll(mod, { approvals: [APPROVAL] }, 1);
    mod.stopMonitor();
  });

  it('the reference changes only on a real change', async () => {
    const mod = await loadModule();
    mockLookup.mockReturnValue([{ note: 'bad', category: 'scam', severity: 'high' }]);
    await runOnePoll(mod, { approvals: [APPROVAL] }, 1);

    const withAlert = mod.getAlerts();
    expect(withAlert).toHaveLength(1);
    expect(mod.getAlerts()).toBe(withAlert);

    // Dismissing something that is not there must not mint a new snapshot —
    // that would re-render every subscriber for nothing.
    mod.dismissAlert(-1);
    expect(mod.getAlerts()).toBe(withAlert);

    mod.dismissAlert(withAlert[0].id);
    expect(mod.getAlerts()).not.toBe(withAlert);
    expect(mod.getAlerts()).toHaveLength(0);

    // Clearing an already-empty store is likewise a no-op.
    const empty = mod.getAlerts();
    mod.clearAlerts();
    expect(mod.getAlerts()).toBe(empty);
    mod.stopMonitor();
  });

  it('subscribe does not invoke the listener synchronously', async () => {
    const mod = await loadModule();
    const fn = vi.fn();
    const unsub = mod.subscribeAlerts(fn);
    expect(fn).not.toHaveBeenCalled();
    unsub();
  });

  it('alerts carry a unique id — ts alone collides within one millisecond', async () => {
    const mod = await loadModule();
    mockLookup.mockReturnValue([{ note: 'bad', category: 'scam', severity: 'high' }]);
    await runOnePoll(mod, {
      approvals: [APPROVAL, { ...APPROVAL, token_symbol: 'DAI' }],
    }, 2);

    const alerts = mod.getAlerts();
    mod.stopMonitor();
    expect(new Set(alerts.map((a) => a.id)).size).toBe(2);
  });
});

describe('approvalMonitor — I3 residue', () => {
  it('entering deniability clears alerts collected in the real session', async () => {
    const mod = await loadModule();
    mockLookup.mockReturnValue([{ note: 'bad', category: 'scam', severity: 'high' }]);

    mod.startMonitor({
      fetchApprovals: async () => [APPROVAL],
      fetchRecentTransfers: async () => [],
      intervalMs: 5,
    });
    await vi.waitFor(() => expect(mod.getAlerts().length).toBe(1));

    // Session flips to a decoy while the monitor is still armed.
    deniable = true;
    await vi.waitFor(() => expect(mod.getAlerts()).toEqual([]));
    mod.stopMonitor();
  });

  it('stopMonitor clears alerts — locking must not leave counterparties readable', async () => {
    const mod = await loadModule();
    mockLookup.mockReturnValue([{ note: 'bad', category: 'scam', severity: 'high' }]);
    await runOnePoll(mod, { approvals: [APPROVAL] }, 1);
    expect(mod.getAlerts()).toHaveLength(1);

    mod.stopMonitor();
    expect(mod.getAlerts()).toEqual([]);
  });
});
