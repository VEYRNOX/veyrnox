// src/risk/address.js
//
// Risk Scoring v1 — PROVISIONAL (ECC independent audit complete 2026-06-23).
//
// Pure EVM-address helpers shared by the history/lookalike signals (S1, S4, S5,
// S7). NO network, NO signer, NO seed — only string/address inspection. Mirrors
// wallet-core/evm/poison.js's normalisation so the two modules agree on what
// "the same address" and "a lookalike" mean.

import { isAddress } from 'ethers';

/** Normalise to a lowercase 0x address, or null if not a valid EVM address. */
export function normAddr(a) {
  if (typeof a !== 'string' || !isAddress(a)) return null;
  return a.toLowerCase();
}

/** Case-insensitive equality of two EVM addresses (null/invalid never equal). */
export function addrEq(a, b) {
  const x = normAddr(a);
  const y = normAddr(b);
  return !!x && !!y && x === y;
}

/**
 * A comparable key for any recipient string. EVM addresses normalise
 * case-insensitively (0x lowercased); other chains (BTC/SOL) are compared on the
 * trimmed exact string, since their encodings are case-sensitive. null if blank.
 */
export function recipientKey(a) {
  if (typeof a !== 'string') return null;
  const evm = normAddr(a);
  if (evm) return evm;
  const trimmed = a.trim();
  return trimmed || null;
}

/** Pull an EVM address out of a raw string or a { address } record, or null. */
export function entryAddr(k) {
  if (typeof k === 'string') return normAddr(k);
  if (k && typeof k === 'object') return normAddr(k.address);
  return null;
}

// The 40 hex nibbles, without the 0x prefix.
const body = (addr) => addr.slice(2);

/**
 * Visual lookalike: same first `prefixLen` and last `suffixLen` nibbles but NOT
 * the same address — exactly the truncated 0xABCD…WXYZ surface poisoning targets.
 */
export function isLookAlike(a, b, { prefixLen = 4, suffixLen = 4 } = {}) {
  const x = normAddr(a);
  const y = normAddr(b);
  if (!x || !y || x === y) return false;
  const bx = body(x);
  const by = body(y);
  return bx.slice(0, prefixLen) === by.slice(0, prefixLen) && bx.slice(-suffixLen) === by.slice(-suffixLen);
}

/**
 * Levenshtein edit distance between two equal-or-near-length strings. Used on the
 * 40-nibble address body to catch near-duplicates whose single-character diff
 * falls OUTSIDE the truncated head/tail (where isLookAlike would miss it).
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Is `recipient` a near-duplicate of `known` by edit distance on the address
 * body, but not the same address? Complements isLookAlike for diffs in the head.
 */
export function isNearDuplicate(recipient, known, maxDistance) {
  const x = normAddr(recipient);
  const y = normAddr(known);
  if (!x || !y || x === y) return false;
  return levenshtein(body(x), body(y)) <= maxDistance;
}
