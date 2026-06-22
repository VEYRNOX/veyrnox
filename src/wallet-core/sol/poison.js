// wallet-core/sol/poison.js
//
// SOL counterpart to evm/poison.js: a SMALL, LOCAL blocklist of known-unspendable
// "burn" addresses, screened on the send path so a fat-finger to one can't
// silently destroy funds. isValidSolAddress only checks FORMAT (a base58 string
// that decodes to a 32-byte key) — these addresses are well-formed but
// unspendable, so they need a SEPARATE guard, exactly as the EVM path screens the
// null/dead address (evm/poison.js#LOCAL_FLAGGED). Local = checking it leaks
// nothing; this never asserts "safe", only "known bad".

import { isValidSolAddress } from './derivation.js';

// Well-known unspendable Solana addresses. The System Program address — all-zero
// bytes, base58 "111…1" (32 ones) — is the dangerous fat-finger sink: a transfer
// there burns funds irreversibly. (Solana's intentional incinerator is NOT listed:
// burning there is a user's explicit choice, not an accident.)
export const SOL_FLAGGED = new Set([
  '11111111111111111111111111111111', // System Program — unspendable null sink
]);

/** True if `address` is a known-unspendable Solana burn/sink address. */
export function isSolFlagged(address) {
  return typeof address === 'string' && SOL_FLAGGED.has(address.trim());
}

/**
 * Guard a Solana SEND recipient: it must be a well-formed address AND not a known
 * unspendable burn sink. Throws with an actionable message. Call on EVERY send
 * path (estimate, send, hardware send) so the format check and the burn screen can
 * never drift apart between call sites.
 * @param {string} address
 */
export function assertSolRecipient(address) {
  if (!isValidSolAddress(address)) throw new Error('Invalid Solana recipient address.');
  if (isSolFlagged(address)) {
    throw new Error(
      'Refusing to send to a known unspendable burn address — the funds would be permanently lost.',
    );
  }
}
