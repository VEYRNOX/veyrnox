// lib/__tests__/portfolios.test.js — the portfolio grouping layer.
//
// Pins the confirmed model: one-portfolio-per-wallet partition, an always-present
// "Main" that holds unassigned wallets, reconcile self-heal, and safe deletion
// (a deleted portfolio's wallets fall back to Main, never orphaned).

import { describe, it, expect, beforeEach } from 'vitest';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.localStorage = new MemStorage();

import {
  MAIN_PORTFOLIO_ID,
  listPortfolios,
  getWalletPortfolio,
  createPortfolio,
  renamePortfolio,
  deletePortfolio,
  assignWalletToPortfolio,
  getActivePortfolioId,
  setActivePortfolioId,
  reconcilePortfolios,
  walletIdsInPortfolio,
  clearAllPortfolios,
} from '../portfolios.js';

beforeEach(() => { clearAllPortfolios(); localStorage.clear(); });

describe('portfolios — Main default', () => {
  it('always has a Main portfolio first', () => {
    const list = listPortfolios();
    expect(list[0]).toEqual({ id: MAIN_PORTFOLIO_ID, name: 'Main' });
  });

  it('an unassigned wallet belongs to Main', () => {
    expect(getWalletPortfolio('w1')).toBe(MAIN_PORTFOLIO_ID);
  });

  it('active portfolio defaults to Main', () => {
    expect(getActivePortfolioId()).toBe(MAIN_PORTFOLIO_ID);
  });
});

describe('portfolios — create / rename / assign', () => {
  it('creates, renames, and assigns wallets (partition: one portfolio per wallet)', () => {
    const savings = createPortfolio('Savings');
    expect(savings.id).not.toBe(MAIN_PORTFOLIO_ID);
    renamePortfolio(savings.id, 'Cold Storage');
    expect(listPortfolios().find((p) => p.id === savings.id).name).toBe('Cold Storage');

    assignWalletToPortfolio('w1', savings.id);
    expect(getWalletPortfolio('w1')).toBe(savings.id);
    // Reassigning moves it (it is in exactly ONE portfolio).
    assignWalletToPortfolio('w1', MAIN_PORTFOLIO_ID);
    expect(getWalletPortfolio('w1')).toBe(MAIN_PORTFOLIO_ID);
  });

  it('assigning to a non-existent portfolio falls back to Main', () => {
    assignWalletToPortfolio('w1', 'bogus');
    expect(getWalletPortfolio('w1')).toBe(MAIN_PORTFOLIO_ID);
  });
});

describe('portfolios — delete falls back to Main (never orphan a wallet)', () => {
  it('moves a deleted portfolio’s wallets to Main and cannot delete Main', () => {
    const p = createPortfolio('Trading');
    assignWalletToPortfolio('w1', p.id);
    assignWalletToPortfolio('w2', p.id);
    setActivePortfolioId(p.id);

    expect(deletePortfolio(MAIN_PORTFOLIO_ID)).toBe(false); // Main is permanent
    expect(deletePortfolio(p.id)).toBe(true);

    expect(getWalletPortfolio('w1')).toBe(MAIN_PORTFOLIO_ID);
    expect(getWalletPortfolio('w2')).toBe(MAIN_PORTFOLIO_ID);
    expect(getActivePortfolioId()).toBe(MAIN_PORTFOLIO_ID); // active repaired
  });
});

describe('portfolios — reconcile (self-heal vs vault wallet ids)', () => {
  it('maps every wallet, prunes orphans, repairs active', () => {
    const p = createPortfolio('Savings');
    assignWalletToPortfolio('w1', p.id);
    assignWalletToPortfolio('gone', p.id);
    setActivePortfolioId('deleted-portfolio');

    const { walletMap, activePortfolioId, portfolios } = reconcilePortfolios(['w1', 'w2']);
    expect(walletMap.w1).toBe(p.id);        // preserved
    expect(walletMap.w2).toBe(MAIN_PORTFOLIO_ID); // defaulted
    expect(walletMap.gone).toBeUndefined();  // pruned
    expect(activePortfolioId).toBe(MAIN_PORTFOLIO_ID); // repaired
    expect(portfolios.some((x) => x.id === p.id)).toBe(true);
  });

  it('walletIdsInPortfolio filters by the map', () => {
    const p = createPortfolio('Savings');
    const map = { w1: p.id, w2: MAIN_PORTFOLIO_ID, w3: p.id };
    expect(walletIdsInPortfolio(p.id, ['w1', 'w2', 'w3'], map)).toEqual(['w1', 'w3']);
    expect(walletIdsInPortfolio(MAIN_PORTFOLIO_ID, ['w1', 'w2', 'w3'], map)).toEqual(['w2']);
  });
});
