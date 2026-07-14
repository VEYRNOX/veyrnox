// Self-send guard — a PURE check the Send flow uses to warn when the recipient is
// the sender's OWN active wallet address (a common footgun: sending to yourself
// burns fees for no transfer). This is a WARN-not-block control, matching the
// project's "plain-language risk before signing" principle and the existing
// warn-not-block pattern (whitelist / look-alike / spend-limit), so it never
// hard-blocks a legitimate self-transfer the user genuinely intends.
//
// Address normalization is per-currency, mirroring lib/addressValidation.js's
// `addressChainKind`:
//   - EVM  (ETH/USDC/USDT/BNB/MATIC/ARB/OP/AVAX): the 0x-address is
//           case-insensitive (EIP-55 checksum is presentational), so compare
//           case-folded.
//   - BTC  : bech32 / base58 is CASE-SIGNIFICANT — compare exactly (after trim).
//   - SOL  : base58 is CASE-SIGNIFICANT — compare exactly (after trim).
//   - unknown: fall back to an exact (trimmed) compare; never throws.
//
// No crypto, no network, no seed/key access — a string comparison only.
import { addressChainKind } from "@/lib/addressValidation";

/**
 * @param {string} toAddress   the recipient the user entered
 * @param {string} fromAddress the active wallet's own address for this asset
 * @param {string} currency    the asset currency (drives normalization)
 * @returns {boolean} true ONLY when both addresses are present and resolve to
 *   the SAME address under the currency's normalization. Empty/missing inputs
 *   return false (nothing to warn about yet) — this never throws.
 */
export function isSelfSend(toAddress, fromAddress, currency) {
  return addressesEqualForCurrency(toAddress, fromAddress, currency);
}

/**
 * Per-currency equality for two addresses — the shared primitive behind isSelfSend
 * and the whitelist compare in SendCrypto.jsx. Case-folded ONLY for EVM; BTC/SOL
 * base58 addresses are case-significant and a naive .toLowerCase() would falsely
 * collide two distinct valid base58 addresses. Empty inputs return false.
 *
 * @param {string} a
 * @param {string} b
 * @param {string} currency
 * @returns {boolean}
 */
export function addressesEqualForCurrency(a, b, currency) {
  if (!a || !b) return false;
  const aa = String(a).trim();
  const bb = String(b).trim();
  if (!aa || !bb) return false;
  if (addressChainKind(currency) === "evm") {
    return aa.toLowerCase() === bb.toLowerCase();
  }
  return aa === bb;
}
