// @ts-nocheck
// Pure, side-effect-free scoring helpers for the Portfolio Health widget.
//
// These functions NEVER read wallet state, never touch storage, never make a
// network call — they operate solely on plain data (`portfolio`, `wallets`)
// handed in by the caller. That keeps I3 (deniability, zero-egress) and I2
// (no silent egress) trivially satisfiable: a decoy/hidden session simply does
// not call these, and even if it did there is nothing to leak.
//
// Scoring model (Option B — real security dashboard, 0–100 total):
//   Factor 1  Security controls        0–40
//   Factor 2  Portfolio diversification 0–35
//   Factor 3  Growth / holdings maturity 0–25
//
// Fail-closed everywhere (I4): a missing/malformed input is treated as the
// weakest (lowest-score) interpretation, never optimistically rounded up.

import { getAsset } from '../wallet-core/assets';

/** Map an asset symbol to its coarse chain "bucket" for cross-chain scoring.
 *  EVM + ERC-20 collapse into one bucket (they share a single derived address),
 *  BTC and Solana are their own buckets. Unknown symbols → null (ignored). */
function chainBucket(symbol) {
  const def = getAsset(symbol);
  if (!def) return null;
  if (def.family === 'evm' || def.family === 'erc20') return 'evm';
  if (def.family === 'btc') return 'btc';
  if (def.family === 'solana') return 'sol';
  return null;
}

/** USD value of an assetTotals entry, treating a failed/indeterminate read as 0
 *  for the purposes of *counting* (the indeterminate flag is handled upstream —
 *  a truly indeterminate portfolio suppresses the whole score). */
function usdOf(entry) {
  const v = entry?.usd;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Herfindahl–Hirschman concentration index over `assetTotals` USD values.
 * @returns {number} 0 (perfectly diversified / no holdings) … 1 (single asset).
 */
export function calculateHHI(assetTotals) {
  const values = Object.values(assetTotals || {}).map(usdOf);
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return values.reduce((s, v) => {
    const share = v / total;
    return s + share * share;
  }, 0);
}

/**
 * Map an HHI concentration index to a diversification sub-score (0–15).
 * Higher concentration = fewer points. Thresholds chosen so an even split of
 * 1 asset → 0, 2–3 assets → 10, 4+ assets → 15.
 */
export function getHHIScore(hhi) {
  if (!Number.isFinite(hhi) || hhi <= 0) return 0; // no holdings
  if (hhi > 0.55) return 0; // one asset dominates
  if (hhi > 0.30) return 10; // ~2–3 assets
  return 15; // 4+ assets
}

/**
 * True when holdings span two or more distinct chain buckets (EVM / BTC / SOL).
 * Fail-closed: null/missing portfolio → false.
 */
export function isCrossChain(portfolio) {
  const assetTotals = portfolio?.assetTotals;
  if (!assetTotals) return false;
  const buckets = new Set();
  for (const [symbol, entry] of Object.entries(assetTotals)) {
    if (usdOf(entry) <= 0) continue;
    const b = chainBucket(symbol);
    if (b) buckets.add(b);
  }
  return buckets.size >= 2;
}

/** Count of assets with a real positive USD balance. */
export function heldAssetCount(portfolio) {
  const assetTotals = portfolio?.assetTotals || {};
  return Object.values(assetTotals).filter((e) => usdOf(e) > 0).length;
}

/**
 * Factor 1 — Security controls (0–40).
 * @param {Array<{backedUp?: boolean}>} wallets
 * @param {boolean} isVaultKekEnrolled  hardware KEK (native SE/StrongBox or web PRF)
 * @param {boolean} hasPasskeyOrBiometric  passkey OR biometric unlock enabled
 */
export function calculateSecurityScore(wallets = [], isVaultKekEnrolled = false, hasPasskeyOrBiometric = false) {
  const list = Array.isArray(wallets) ? wallets : [];
  if (list.length === 0) return 0;

  let pts = 0;
  if (list.some((w) => w?.backedUp === true)) pts += 10; // backup
  if (isVaultKekEnrolled === true) pts += 15; // hardware KEK
  if (hasPasskeyOrBiometric === true) pts += 10; // passkey/biometric

  // Floor: a wallet exists but nothing is set up → still a minimum posture of 5.
  pts = Math.max(pts, 5);
  return Math.min(40, pts);
}

/**
 * Factor 2 — Portfolio diversification (0–35).
 * @param {object} portfolio  { assetTotals, grandTotal }
 * @param {Array<{backedUp?: boolean}>} [wallets]  optional, enables the
 *   >50%-backed-up bonus (defaults to [] so `calculateDiversificationScore(p)`
 *   remains valid — the bonus is simply omitted when wallets are not supplied).
 */
export function calculateDiversificationScore(portfolio, wallets = []) {
  if (!portfolio) return 0;
  let pts = getHHIScore(calculateHHI(portfolio.assetTotals)); // 0–15

  const list = Array.isArray(wallets) ? wallets : [];
  if (list.length > 0) {
    const backed = list.filter((w) => w?.backedUp === true).length;
    if (backed / list.length > 0.5) pts += 5; // majority backed up
  }

  if (isCrossChain(portfolio)) pts += 10; // cross-chain bonus

  return Math.min(35, pts);
}

/**
 * Factor 3 — Growth / holdings maturity (0–25).
 * Age heuristic is honest-disabled: the portfolio blob carries no vault-age
 * metadata, so we award the documented "age unknown" 5-pt branch when a vault
 * demonstrably exists (has holdings), never the full 10-pt >30-day bonus.
 */
export function calculateGrowthScore(portfolio) {
  if (!portfolio) return 0;
  let pts = 0;
  const grandTotal = typeof portfolio.grandTotal === 'number' ? portfolio.grandTotal : 0;
  if (grandTotal > 0) pts += 10; // non-zero holdings
  if (heldAssetCount(portfolio) >= 3) pts += 5; // multi-asset
  if (grandTotal > 0) pts += 5; // age-unknown dummy branch (no age metadata)
  return Math.min(25, pts);
}

export const HEALTH_LABELS = [
  { min: 75, label: 'Excellent' },
  { min: 50, label: 'Good' },
  { min: 25, label: 'Fair' },
  { min: 0, label: 'Needs Attention' },
];

export function healthLabel(total) {
  return (HEALTH_LABELS.find((l) => total >= l.min) || HEALTH_LABELS[HEALTH_LABELS.length - 1]).label;
}

/**
 * Aggregate the three factors into a single health verdict.
 *
 * I3 (deniability): a decoy/hidden/demo session suppresses the score entirely
 * (`total: null, isDeniability: true`) so it cannot become a session tell.
 * I4 (fail-closed): an indeterminate portfolio read (any failed balance) also
 * suppresses the score (`total: null, isIncomplete: true`) rather than present
 * a silently-understated number.
 *
 * @returns {{ total: number|null, factors: Array, label: string|null,
 *             isIncomplete: boolean, isDeniability: boolean }}
 */
export function calculatePortfolioHealth({
  wallets = [],
  portfolio = null,
  kekEnrolled = false,
  passkey = false,
  isDeniability = false,
} = {}) {
  if (isDeniability === true) {
    return { total: null, factors: [], label: null, isIncomplete: false, isDeniability: true };
  }
  if (portfolio?.indeterminate === true) {
    return { total: null, factors: [], label: null, isIncomplete: true, isDeniability: false };
  }

  const security = calculateSecurityScore(wallets, kekEnrolled, passkey);
  const diversification = calculateDiversificationScore(portfolio, wallets);
  const growth = calculateGrowthScore(portfolio);
  const total = security + diversification + growth;

  const factors = [
    { key: 'diversification', label: 'Diversification', score: diversification, max: 35 },
    { key: 'security', label: 'Security', score: security, max: 40 },
    { key: 'growth', label: 'Growth', score: growth, max: 25 },
  ];

  return { total, factors, label: healthLabel(total), isIncomplete: false, isDeniability: false };
}
