// wallet-core/evm/spam.js
//
// Spam / scam-airdrop token classification (Phase S2 — transaction safety).
//
// THE PROBLEM
//   Scammers airdrop worthless tokens whose NAME/SYMBOL is itself the attack: a
//   URL or "claim your reward" lure that drives the victim to a drainer site, or
//   a fake stablecoin meant to be mistaken for the real one. They clutter the
//   wallet and, worse, bait interaction. The user never acquired them.
//
// THE DEFENCE (this module)
//   Pure, deterministic classification of a token's PUBLIC metadata + how it was
//   acquired into { spam, reasons[] }. The UI hides flagged tokens by default,
//   shows a "show hidden" affordance, and lets the user override per token.
//
// SECURITY / SCOPE RATIONALE
//   - DISPLAY-ONLY. This NEVER touches balances, keys, or the chain. Hiding a
//     token changes nothing on-chain; the funds (if any) are untouched and the
//     user can always reveal it. No false sense of "removal".
//   - NO keys, NO signing, NO network. Pure inspection of strings/numbers. Lives
//     under the guarded wallet-core path so the RNG tripwire covers it too.
//   - Heuristic, never absolute: returns REASONS, and the UI frames them as
//     "looks like spam", not a guarantee. A legitimate token can be unhidden.

// Lure / phishing markers commonly embedded in scam-token names and symbols.
const URL_RE = /(https?:\/\/|www\.|\.com|\.io|\.xyz|\.net|\.org|\.app|\.finance|\.vip|t\.me|bit\.ly)/i;
const LURE_RE =
  /(claim|reward|airdrop|free|voucher|gift|bonus|visit|redeem|winner|congrat|giveaway|presale|\$\s*\d)/i;
// Non-ASCII (homoglyph / emoji) in a ticker is a strong spam tell — real tickers
// are plain ASCII letters/digits.
const NON_ASCII_RE = /[^\x00-\x7F]/;

/**
 * Classify a single token holding.
 *
 * @param {{
 *   symbol?: string,
 *   name?: string,
 *   balance?: number,            // human units
 *   value_usd?: number,          // fiat value of the holding (0 / unknown for spam)
 *   acquired_via?: string,       // 'purchase' | 'transfer' | 'airdrop' | 'unknown'
 *   verified?: boolean,          // on a trusted token list (CoinGecko-style)
 * }} token
 * @returns {{ spam: boolean, reasons: string[] }}
 */
export function classifyToken(token = {}) {
  const reasons = [];
  const name = String(token.name || '');
  const symbol = String(token.symbol || '');
  const text = `${name} ${symbol}`;
  const value = Number(token.value_usd) || 0;
  const balance = Number(token.balance) || 0;
  const acquired = token.acquired_via;

  // A verified, listed token is never treated as spam regardless of the below.
  if (token.verified) return { spam: false, reasons: [] };

  if (URL_RE.test(text)) reasons.push('Name/symbol contains a website link — classic drainer lure');
  if (LURE_RE.test(text)) reasons.push('Name/symbol uses "claim/reward/airdrop"-style bait wording');
  if (NON_ASCII_RE.test(symbol)) reasons.push('Ticker contains non-standard (homoglyph/emoji) characters');

  // An unsolicited airdrop the user never acquired — the defining spam vector.
  if (acquired === 'airdrop') {
    reasons.push('Airdropped without your interaction');
  }

  // A large balance worth ~nothing is the hallmark of a worthless airdrop token.
  if (value <= 0 && balance > 0) {
    reasons.push('Worthless: a non-zero balance with no market value');
  }

  return { spam: reasons.length > 0, reasons };
}

/**
 * Apply classification + the user's explicit per-token overrides to a token list.
 * Pure: returns a NEW array, mutates nothing. `overrides` maps a token id to a
 * forced state — 'show' (user un-hid a flagged token) or 'hide' (user hid a
 * clean one). The override always wins, so the user is never overruled.
 *
 * @param {object[]} tokens
 * @param {Record<string,'show'|'hide'>} [overrides]
 * @returns {Array<object & { spam: boolean, reasons: string[], hidden: boolean, overridden: boolean }>}
 */
export function annotateTokens(tokens = [], overrides = {}) {
  return tokens.map((t) => {
    const { spam, reasons } = classifyToken(t);
    const override = overrides[t.id];
    let hidden = spam; // default: hide detected spam
    if (override === 'show') hidden = false;
    else if (override === 'hide') hidden = true;
    return { ...t, spam, reasons, hidden, overridden: override != null };
  });
}
