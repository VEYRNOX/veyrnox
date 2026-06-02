// lib/portfolios.js — PORTFOLIOS: named groups of wallets (non-secret).
//
// MODEL (confirmed): a PORTFOLIO is a named group of WALLETS. Each wallet belongs
// to EXACTLY ONE portfolio (a clean partition — a wallet's balance counts once).
// A default "Main" portfolio always exists and holds every wallet that hasn't
// been moved, so a single-wallet user never has to think about portfolios; power
// users can create more and reassign wallets between them.
//
// SECURITY BOUNDARY: like walletMeta, this stores ONLY non-secret organisation
// (portfolio names + which wallet id is in which group + the active selection).
// NO seeds, keys, or addresses. Seeds live solely in the encrypted vault
// (multiVault.js). Persisted in localStorage; safe-fail to defaults on any error.
// At-rest, this reveals portfolio names + the wallet COUNT of the primary vault —
// the same minor metadata exposure flagged for walletMeta, and independent of the
// duress/stealth deniability features (whose hidden wallets are never listed here).

const PORTFOLIOS_KEY = 'veyrnox-portfolios';        // { portfolios: [{id,name}], walletMap: {walletId: portfolioId} }
const ACTIVE_KEY = 'veyrnox-active-portfolio';      // portfolioId string

export const MAIN_PORTFOLIO_ID = 'main';
const MAIN_PORTFOLIO_NAME = 'Main';

function newPortfolioId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = 'pf-';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function readState() {
  try {
    const raw = localStorage.getItem(PORTFOLIOS_KEY);
    if (!raw) return { portfolios: [], walletMap: {} };
    const obj = JSON.parse(raw);
    return {
      portfolios: Array.isArray(obj?.portfolios) ? obj.portfolios : [],
      walletMap: obj && typeof obj.walletMap === 'object' && obj.walletMap ? obj.walletMap : {},
    };
  } catch {
    return { portfolios: [], walletMap: {} };
  }
}

function writeState(state) {
  try { localStorage.setItem(PORTFOLIOS_KEY, JSON.stringify(state)); } catch { /* best-effort */ }
}

function ensureMain(state) {
  if (!state.portfolios.some((p) => p.id === MAIN_PORTFOLIO_ID)) {
    state.portfolios.unshift({ id: MAIN_PORTFOLIO_ID, name: MAIN_PORTFOLIO_NAME });
  }
  return state;
}

/** All portfolios in display order ("Main" always first). */
export function listPortfolios() {
  const state = ensureMain(readState());
  return state.portfolios.map((p) => ({ id: p.id, name: p.name }));
}

/** The portfolio a wallet belongs to (defaults to Main if unassigned). */
export function getWalletPortfolio(walletId) {
  const { walletMap } = readState();
  return walletMap[walletId] || MAIN_PORTFOLIO_ID;
}

/** Create a new (empty) portfolio; returns it. */
export function createPortfolio(name) {
  const state = ensureMain(readState());
  const p = { id: newPortfolioId(), name: (name || 'Portfolio').trim().slice(0, 40) || 'Portfolio' };
  state.portfolios.push(p);
  writeState(state);
  return p;
}

export function renamePortfolio(id, name) {
  const state = ensureMain(readState());
  const p = state.portfolios.find((x) => x.id === id);
  if (p) { p.name = (name || '').trim().slice(0, 40) || p.name; writeState(state); }
}

/**
 * Delete a portfolio (NOT Main). Its wallets fall back to Main (never orphaned —
 * a wallet must always live somewhere). Returns true if deleted.
 */
export function deletePortfolio(id) {
  if (id === MAIN_PORTFOLIO_ID) return false;
  const state = ensureMain(readState());
  state.portfolios = state.portfolios.filter((p) => p.id !== id);
  for (const wid of Object.keys(state.walletMap)) {
    if (state.walletMap[wid] === id) state.walletMap[wid] = MAIN_PORTFOLIO_ID;
  }
  writeState(state);
  if (getActivePortfolioId() === id) setActivePortfolioId(MAIN_PORTFOLIO_ID);
  return true;
}

/** Move a wallet into a portfolio (one-portfolio-per-wallet partition). */
export function assignWalletToPortfolio(walletId, portfolioId) {
  const state = ensureMain(readState());
  const target = state.portfolios.some((p) => p.id === portfolioId) ? portfolioId : MAIN_PORTFOLIO_ID;
  state.walletMap[walletId] = target;
  writeState(state);
}

export function getActivePortfolioId() {
  try { return localStorage.getItem(ACTIVE_KEY) || MAIN_PORTFOLIO_ID; } catch { return MAIN_PORTFOLIO_ID; }
}

export function setActivePortfolioId(id) {
  try { localStorage.setItem(ACTIVE_KEY, id || MAIN_PORTFOLIO_ID); } catch { /* best-effort */ }
}

/**
 * Reconcile portfolio state against the authoritative wallet-id list from the
 * vault. Guarantees:
 *   - "Main" exists,
 *   - every vault wallet is mapped to a real portfolio (default Main),
 *   - mappings for removed wallets are pruned,
 *   - the active portfolio id points at a real portfolio (default Main).
 * Returns { portfolios, walletMap, activePortfolioId } for React state.
 * @param {string[]} walletIds
 */
export function reconcilePortfolios(walletIds) {
  const state = ensureMain(readState());
  const valid = new Set(state.portfolios.map((p) => p.id));
  // Map every wallet; prune orphans.
  const nextMap = {};
  for (const id of walletIds) {
    const cur = state.walletMap[id];
    nextMap[id] = cur && valid.has(cur) ? cur : MAIN_PORTFOLIO_ID;
  }
  state.walletMap = nextMap;
  writeState(state);

  let active = getActivePortfolioId();
  if (!valid.has(active)) { active = MAIN_PORTFOLIO_ID; setActivePortfolioId(active); }

  return {
    portfolios: state.portfolios.map((p) => ({ id: p.id, name: p.name })),
    walletMap: { ...state.walletMap },
    activePortfolioId: active,
  };
}

/** Wallet ids in a given portfolio, from a walletMap + ordered id list. */
export function walletIdsInPortfolio(portfolioId, walletIds, walletMap) {
  return walletIds.filter((id) => (walletMap[id] || MAIN_PORTFOLIO_ID) === portfolioId);
}

/** Clear ALL portfolio data (used on vault wipe / full reset). */
export function clearAllPortfolios() {
  try { localStorage.removeItem(PORTFOLIOS_KEY); localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
}
