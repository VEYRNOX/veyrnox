// wallet-core/evm/poison.js
//
// Address-poisoning / look-alike recipient screening (Phase S2 — transaction
// safety). LOCAL-ONLY by default: nothing here queries a third party, so it
// leaks no user intent off-device.
//
// THE ATTACK
//   Address poisoning: a scammer sends the victim a dust transfer FROM a vanity
//   address whose first and last characters match a real counterparty the victim
//   trusts (wallets truncate to 0xABCD…WXYZ, so the middle is never eyeballed).
//   The poison address then sits in the victim's history; next time they pay
//   that counterparty they copy the wrong, look-alike row and send to the
//   attacker. The two addresses are visually identical at a glance but differ in
//   the middle nibbles.
//
// THE DEFENCE (this module)
//   Given a recipient and the set of addresses the user has actually interacted
//   with (their own transaction history / address book / whitelist), flag when
//   the recipient is a LOOK-ALIKE of a known address — same prefix + suffix,
//   different middle, not an exact match. The send flow surfaces this as a
//   WARNING before signing. It never blocks, and it never claims an address is
//   "safe" — only that it could not verify it, or that it resembles a known one.
//
// SECURITY RATIONALE
//   - NO keys, NO signing, NO network. Pure string/address inspection. Lives
//     under the guarded wallet-core path so the RNG tripwire covers it too.
//   - Local-first by design (privacy): the default screen compares only against
//     the user's OWN data. An optional, off-by-default remote threat-intel screen
//     is a separate, explicitly-disclosed choice in the UI — this module never
//     makes a network call itself.

import { isAddress } from 'ethers';

// Normalise to a lowercase 0x address, or null if it is not a valid EVM address.
// Non-EVM recipients (BTC/SOL) return null and are simply not screened here.
function norm(a) {
  if (typeof a !== 'string' || !isAddress(a)) return null;
  return a.toLowerCase();
}

// The 40 hex nibbles, without the 0x prefix.
const body = (addr) => addr.slice(2);

/**
 * Are two addresses visual look-alikes? Same first `prefixLen` and last
 * `suffixLen` hex nibbles, but NOT the same address. This is exactly the surface
 * address-poisoning targets — what a user sees in a truncated 0xABCD…WXYZ row.
 * @returns {boolean}
 */
export function isLookAlike(a, b, { prefixLen = 4, suffixLen = 4 } = {}) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x === y) return false;
  const bx = body(x);
  const by = body(y);
  const samePrefix = bx.slice(0, prefixLen) === by.slice(0, prefixLen);
  const sameSuffix = bx.slice(-suffixLen) === by.slice(-suffixLen);
  return samePrefix && sameSuffix;
}

/**
 * Normalise an arbitrary "known address" entry (a raw string, or an object with
 * an `address` field plus metadata like label/source/date) into a comparable
 * record, or null if it carries no valid EVM address.
 */
function asEntry(k) {
  if (typeof k === 'string') {
    const address = norm(k);
    return address ? { address } : null;
  }
  if (k && typeof k === 'object') {
    const address = norm(k.address);
    return address ? { ...k, address } : null;
  }
  return null;
}

/**
 * Screen a recipient against the set of addresses the user has interacted with.
 * LOCAL-ONLY: compares strings, calls nothing.
 *
 * @param {string} recipient            the address being sent to
 * @param {Array<string|{address:string}>} knownAddresses  history / book / whitelist
 * @param {{prefixLen?:number, suffixLen?:number}} [opts]
 * @returns {{
 *   valid: boolean,        // recipient is a parseable EVM address
 *   known: boolean,        // recipient EXACTLY matches a known address
 *   lookAlikes: object[],  // known entries the recipient resembles (poisoning risk)
 *   suspicious: boolean     // look-alikes exist AND recipient is not itself known
 * }}
 */
export function screenRecipient(recipient, knownAddresses = [], opts = {}) {
  const target = norm(recipient);
  if (!target) {
    return { valid: false, known: false, lookAlikes: [], suspicious: false };
  }

  // De-duplicate the known set by address, keeping the first entry's metadata.
  const seen = new Map();
  for (const k of knownAddresses) {
    const entry = asEntry(k);
    if (entry && !seen.has(entry.address)) seen.set(entry.address, entry);
  }

  const known = seen.has(target);
  const lookAlikes = [];
  for (const entry of seen.values()) {
    if (entry.address === target) continue;
    if (isLookAlike(target, entry.address, opts)) lookAlikes.push(entry);
  }

  return {
    valid: true,
    known,
    lookAlikes,
    // If the exact recipient is itself a known-good address, a coincidental
    // look-alike in history is not the poisoning pattern — don't cry wolf.
    suspicious: lookAlikes.length > 0 && !known,
  };
}

// A SMALL, LOCAL list of addresses to flag outright (burn/null sinks and any
// addresses confirmed as scam sinks). Local = querying it leaks nothing. This
// can later be hydrated from a DOWNLOADED list and still stay local; it is
// deliberately NOT a remote lookup. It never asserts "safe", only "known bad".
export const LOCAL_FLAGGED = new Set(
  [
    '0x0000000000000000000000000000000000000000', // null / burn address
    '0x000000000000000000000000000000000000dead', // common burn sink
  ].map((a) => a.toLowerCase())
);

/** True if `a` is on the local flagged list. */
export function isLocallyFlagged(a) {
  const x = norm(a);
  return !!x && LOCAL_FLAGGED.has(x);
}
