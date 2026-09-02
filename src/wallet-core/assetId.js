// wallet-core/assetId.js — composite (symbol, chain) identity primitives.
//
// PHASE 0 of per-chain expansion (docs/per-chain-expansion-scope.md).
// Introduces the vocabulary — a stable "{symbol}:{chain}" identifier — without
// migrating any storage or caller yet. Every existing ASSETS row is currently
// symbol-unique, so `formatAssetId(entry)` is 1:1 with `entry.symbol` today;
// the point of this module is to make that mapping explicit and callable so
// Phase 1 can add duplicate-symbol rows (e.g. USDC on Polygon + Base) without
// re-shaping the identity model at the same time it adds user-visible rows.
//
// FORMAT
// -------
//   id := "{symbol}:{chain}"
//     - symbol: 1-16 A-Z0-9_ chars (matches every current ASSETS.symbol)
//     - chain:  1-32 a-z0-9-  chars (matches every current chain key)
// The separator is a literal colon; neither field may contain one. `parseAssetId`
// hard-fails on malformed input (fail-honest — never a partial parse).

const SYMBOL_RE = /^[A-Z0-9_]{1,16}$/;
const CHAIN_RE  = /^[a-z0-9-]{1,32}$/;
const ID_RE     = /^([A-Z0-9_]{1,16}):([a-z0-9-]{1,32})$/;

/**
 * Build a composite id from an ASSETS-shaped entry (or a plain {symbol, chain}).
 * @param {{symbol: string, chain: string}} entry
 * @returns {string}
 */
export function formatAssetId(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('formatAssetId: entry must be an object with {symbol, chain}');
  }
  const { symbol, chain } = entry;
  if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) {
    throw new TypeError(`formatAssetId: invalid symbol ${JSON.stringify(symbol)}`);
  }
  if (typeof chain !== 'string' || !CHAIN_RE.test(chain)) {
    throw new TypeError(`formatAssetId: invalid chain ${JSON.stringify(chain)}`);
  }
  return `${symbol}:${chain}`;
}

/**
 * Parse a composite id back into its components. Returns null on any malformed
 * input — callers must handle null (never assume a partial parse succeeded).
 * @param {string} id
 * @returns {{symbol: string, chain: string} | null}
 */
export function parseAssetId(id) {
  if (typeof id !== 'string') return null;
  const m = ID_RE.exec(id);
  if (!m) return null;
  return { symbol: m[1], chain: m[2] };
}

/**
 * True iff the string is a well-formed composite id. Cheap discriminator for
 * callers that need to tolerate BOTH legacy symbol-only entries and new
 * composite ids during the Phase 1 migration.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAssetIdString(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

