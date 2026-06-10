// src/rehearsal/snapshot.js — Deniability Rehearsal Simulator (build brief §4).
//
// A PURE read of the ALREADY-UNLOCKED active set's display state — the exact
// facts an adversary sees on the dashboard after a coerced unlock. It is a lens,
// not a renderer and not a credential flow:
//   • In-memory only. It takes the state useWallet()/usePortfolio() already hold
//     in memory; it NEVER imports vault.js or any derivation/decrypt path
//     (LLD decision #2 — fail closed, never attempt a decrypt).
//   • Active-set scoped. It reads ONLY the unlocked set's wallets/addresses; the
//     I3 set-seal is upstream (the provider only decrypted THIS set), so the
//     snapshot can never reach another set's state.
//   • No session-type tell. It deliberately DROPS isDecoy/isHidden/wasWiped — a
//     cardinality (D2) / credential-type (D4) leak is the whole thing the tool
//     exists to catch, so the snapshot must not carry one itself.
//   • Fail closed (I4). No unlocked state → { available:false } (the view shows
//     an honest message, never a fabricated render). A missing/incomplete
//     balance read marks the total incomplete rather than asserting a confident
//     figure.
//
// Reuses the real aggregation (sumPortfolioTotal) and portfolio constant rather
// than forking them, so what it reads is what the live dashboard computes.

import { sumPortfolioTotal } from '@/lib/portfolioBalances';
import { MAIN_PORTFOLIO_ID } from '@/lib/portfolios';

/**
 * Build the adversary-visible snapshot of the active set's dashboard surface.
 * @param {object|null} walletState - the object useWallet() exposes (or null).
 * @param {object|null} portfolio - the usePortfolio() data (computePortfolio
 *   shape), or null while balances load / are unavailable.
 * @returns {{available:boolean, portfolioName?:string, total?:number,
 *   incomplete?:boolean, wallets?:Array}} A plain object carrying ONLY the
 *   active-set display facts — no session-type flags, no cross-set data.
 */
export function buildRehearsalSnapshot(walletState, portfolio) {
  // Fail closed: without an unlocked set's display state there is nothing honest
  // to show, and we must NOT try to decrypt one (LLD decision #2).
  if (!walletState || !walletState.isUnlocked || !Array.isArray(walletState.wallets)) {
    return { available: false };
  }

  const {
    wallets,
    walletPortfolioMap = {},
    portfolios = [],
    activePortfolioId = MAIN_PORTFOLIO_ID,
  } = walletState;

  // Scope to the ACTIVE portfolio exactly as the dashboard does.
  const inActive = (w) => (walletPortfolioMap[w.id] || MAIN_PORTFOLIO_ID) === activePortfolioId;
  const pfWallets = wallets.filter(inActive);
  const portfolioName = portfolios.find((p) => p.id === activePortfolioId)?.name || 'Main';

  const byWallet = portfolio?.byWallet || null;
  // No balance data yet → fail-closed incompleteness, not a confident $0 (I4).
  const { total, indeterminate } = byWallet
    ? sumPortfolioTotal(pfWallets, byWallet)
    : { total: 0, indeterminate: true };

  const walletRows = pfWallets.map((w) => ({
    name: w.name,
    backedUp: !!w.backedUp,
    assets: (byWallet?.[w.id]?.assets || []).map((a) => ({
      symbol: a.symbol,
      amount: a.amount,
      usd: a.usd,
      indeterminate: !!a.indeterminate,
    })),
  }));

  return {
    available: true,
    portfolioName,
    total,
    incomplete: !!indeterminate,
    wallets: walletRows,
  };
}
