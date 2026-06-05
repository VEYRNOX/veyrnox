// src/lib/usdDisclosure.js
//
// Source of truth for which LIVE routes render USD_RATES-derived dollar figures
// and therefore must carry the reference-rate disclosure (approxUsd /
// ReferenceRateNote). Enforced by usdDisclosure.test.js: a new live page that
// renders a stale-rate $ figure fails the suite until it is categorized here.
//
// Each entry is exactly one of:
//   { discloses: true }              page must reference approxUsd or ReferenceRateNote
//   { exempt: <why>, note: <string> } imports USD_RATES but renders NO $ figure
export const USD_DISCLOSURE = {
  '/':           { discloses: true },   // Dashboard -> WalletPortfolioPage total + DemoDashboard
  '/send':       { discloses: true },   // fee fiat estimate + spend-cap previews
  '/security':   { discloses: true },   // "sent today" daily-limit progress
  '/risk-score': {
    exempt: 'internal-math',
    note: 'USD_RATES feeds risk ratios only; the page renders a 0–10 score, no $ figure.',
  },
};

// Components (not routes) that render a USD_RATES-derived $ figure. A page that
// imports one "touches USD display" even if it does not import USD_RATES itself,
// so it must be categorized in USD_DISCLOSURE.
export const USD_DISPLAY_COMPONENTS = [
  'TokenList', 'AssetDistributionChart', 'PortfolioChart', 'ExportTransactions',
];
