// src/rehearsal/__tests__/snapshot.test.js
//
// Deniability Rehearsal Simulator — snapshot module (build brief §4, §8).
// buildRehearsalSnapshot is a PURE read of the already-unlocked active set's
// display state. It must:
//   • reuse the real aggregation (sumPortfolioTotal), not fork it,
//   • NEVER carry a session-type flag (isDecoy/isHidden/wasWiped) — that is the
//     D2/D4 leak the whole tool exists to prevent,
//   • fail closed (available:false) when the unlocked state is absent, and never
//     attempt a decrypt (LLD decision #2),
//   • mark the total incomplete rather than assert a confident figure when a
//     balance read is missing/failed (I4 fail-closed).
//
// Source-scanning (no @testing-library, mirroring portfolioDeniability.test.js)
// guards the "no decrypt path" invariant; unit tests cover the data shape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildRehearsalSnapshot } from '../snapshot.js';
import { MAIN_PORTFOLIO_ID } from '@/lib/portfolios';

const here = dirname(fileURLToPath(import.meta.url));
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const snapshotSrc = stripComments(readFileSync(resolve(here, '../snapshot.js'), 'utf8'));

// A realistic unlocked-set state, as useWallet() exposes it. The session-type
// flags are deliberately present here (the provider always carries them) so the
// tests prove the snapshot DROPS them.
const walletState = () => ({
  isUnlocked: true,
  wallets: [
    { id: 'w1', name: 'Main', backedUp: true, enabledAssets: ['ETH', 'BTC'] },
    { id: 'w2', name: 'Savings', backedUp: false, enabledAssets: ['ETH'] },
  ],
  activeWalletId: 'w1',
  walletAddresses: { w1: { evm: '0xabc' }, w2: { evm: '0xdef' } },
  portfolios: [{ id: MAIN_PORTFOLIO_ID, name: 'Main' }],
  activePortfolioId: MAIN_PORTFOLIO_ID,
  walletPortfolioMap: {}, // both wallets fall through to Main
  isDecoy: true,
  isHidden: false,
  wasWiped: false,
});

const portfolio = () => ({
  byWallet: {
    w1: {
      assets: [
        { symbol: 'ETH', amount: 1.5, usd: 3000, indeterminate: false },
        { symbol: 'BTC', amount: 0, usd: 0, indeterminate: false },
      ],
      total: 3000,
      indeterminate: false,
    },
    w2: {
      assets: [{ symbol: 'ETH', amount: 0, usd: 0, indeterminate: false }],
      total: 0,
      indeterminate: false,
    },
  },
  grandTotal: 3000,
  assetTotals: {},
  indeterminate: false,
});

describe('buildRehearsalSnapshot — active-set display read', () => {
  it('is available for an unlocked set', () => {
    expect(buildRehearsalSnapshot(walletState(), portfolio()).available).toBe(true);
  });

  it('carries the active portfolio name and total from the real aggregation', () => {
    const snap = buildRehearsalSnapshot(walletState(), portfolio());
    expect(snap.portfolioName).toBe('Main');
    expect(snap.total).toBe(3000);
    expect(snap.incomplete).toBe(false);
  });

  it('lists the active-portfolio wallets with name, backup status, and asset rows', () => {
    const snap = buildRehearsalSnapshot(walletState(), portfolio());
    expect(snap.wallets).toHaveLength(2);
    expect(snap.wallets[0]).toMatchObject({ name: 'Main', backedUp: true });
    expect(snap.wallets[0].assets.map((a) => a.symbol)).toEqual(['ETH', 'BTC']);
  });

  it('scopes to the ACTIVE portfolio only (a wallet in another portfolio is excluded)', () => {
    const st = walletState();
    st.portfolios = [{ id: MAIN_PORTFOLIO_ID, name: 'Main' }, { id: 'pf2', name: 'Cold' }];
    st.walletPortfolioMap = { w2: 'pf2' };
    const snap = buildRehearsalSnapshot(st, portfolio());
    expect(snap.wallets.map((w) => w.name)).toEqual(['Main']);
  });

  it('NEVER carries the session-type flags (D2/D4 — no cardinality/credential tell)', () => {
    const snap = buildRehearsalSnapshot(walletState(), portfolio());
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toMatch(/isDecoy|isHidden|wasWiped/);
  });

  it('fails closed (available:false) when the unlocked state is absent', () => {
    expect(buildRehearsalSnapshot(null, null).available).toBe(false);
    expect(buildRehearsalSnapshot({ isUnlocked: false }, null).available).toBe(false);
  });

  it('marks the total incomplete (never a confident 0) when portfolio data is absent', () => {
    const snap = buildRehearsalSnapshot(walletState(), null);
    expect(snap.available).toBe(true);
    expect(snap.incomplete).toBe(true);
    expect(snap.total).toBe(0);
  });

  it('propagates I4 incompleteness when a constituent balance read failed', () => {
    const pf = portfolio();
    pf.byWallet.w1.indeterminate = true;
    expect(buildRehearsalSnapshot(walletState(), pf).incomplete).toBe(true);
  });
});

describe('snapshot.js — no decrypt path is reachable (LLD decision #2)', () => {
  it('imports no vault / derivation / seed module', () => {
    expect(snapshotSrc).not.toMatch(/wallet-core\/(vault|duress|stealth|multiVault|panic)/);
  });

  it('references no decrypt / derive / reveal primitive', () => {
    expect(snapshotSrc).not.toMatch(/\b(decryptVault|deriveKey|encryptVault|revealWalletMnemonic|unlock)\b/);
  });
});
