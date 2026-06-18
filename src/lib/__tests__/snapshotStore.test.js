import { describe, it, expect, beforeEach } from 'vitest';
import { listSnapshots, saveSnapshot, deleteSnapshot } from '../snapshotStore.js';

const ADDRS = { w1: { evm: '0xABCD', btc: null, sol: null } };
const DECOY_ADDRS = { w1: { evm: '0xDECO', btc: null, sol: null } };
const PORTFOLIO = {
  grandTotal: 1234.56,
  assetTotals: { ETH: { usd: 1000 }, USDC: { usd: 234.56 } },
  indeterminate: false,
};

beforeEach(() => localStorage.clear());

describe('listSnapshots', () => {
  it('returns [] when nothing saved', () => {
    expect(listSnapshots(ADDRS)).toEqual([]);
  });

  it('returns [] when walletAddresses is {}', () => {
    expect(listSnapshots({})).toEqual([]);
  });
});

describe('saveSnapshot', () => {
  it('saves a snapshot that appears in listSnapshots with correct fields', () => {
    const snap = saveSnapshot(ADDRS, PORTFOLIO, 'My Label', 'A note');
    expect(snap).not.toBeNull();

    const list = listSnapshots(ADDRS);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('My Label');
    expect(list[0].note).toBe('A note');
    expect(list[0].total_usd).toBe(1234.56);
    expect(list[0].breakdown).toEqual({ ETH: 1000, USDC: 234.56 });
    expect(list[0].indeterminate).toBe(false);
    expect(list[0].id).toMatch(/^snap-/);
    expect(list[0].created_date).toBeTruthy();
  });

  it('prepends newest first — second save appears at index 0', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'First', '');
    saveSnapshot(ADDRS, PORTFOLIO, 'Second', '');
    const list = listSnapshots(ADDRS);
    expect(list[0].label).toBe('Second');
    expect(list[1].label).toBe('First');
  });

  it('generates a default label when label is empty string', () => {
    const snap = saveSnapshot(ADDRS, PORTFOLIO, '', '');
    expect(snap.label).toBeTruthy();
    expect(snap.label.length).toBeGreaterThan(0);
  });

  it('returns null when walletAddresses is {}', () => {
    const result = saveSnapshot({}, PORTFOLIO, 'Label', '');
    expect(result).toBeNull();
  });
});

describe('deniability isolation', () => {
  it('different address sets produce different keys — real vs decoy isolation', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'Real', '');
    saveSnapshot(DECOY_ADDRS, PORTFOLIO, 'Decoy', '');

    const realList = listSnapshots(ADDRS);
    const decoyList = listSnapshots(DECOY_ADDRS);

    expect(realList).toHaveLength(1);
    expect(realList[0].label).toBe('Real');
    expect(decoyList).toHaveLength(1);
    expect(decoyList[0].label).toBe('Decoy');
  });
});

describe('deleteSnapshot', () => {
  it('removes snapshot by id, leaving others intact', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'Keep', '');
    const toDelete = saveSnapshot(ADDRS, PORTFOLIO, 'Delete Me', '');
    expect(listSnapshots(ADDRS)).toHaveLength(2);

    deleteSnapshot(ADDRS, toDelete.id);
    const list = listSnapshots(ADDRS);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Keep');
  });

  it('is a no-op for unknown id', () => {
    saveSnapshot(ADDRS, PORTFOLIO, 'Snap', '');
    deleteSnapshot(ADDRS, 'nonexistent-id');
    expect(listSnapshots(ADDRS)).toHaveLength(1);
  });
});
