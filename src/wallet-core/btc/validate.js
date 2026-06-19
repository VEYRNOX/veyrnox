// wallet-core/btc/validate.js
//
// Authoritative Bitcoin recipient-address validation, shared by the Send flow's
// UI guard and an EARLY check in the send path. It uses @scure/btc-signer's
// `Address(params).decode` — the SAME library (and the same network params) that
// `addOutputAddress` enforces at sign time — so the UI guard, the early send-path
// assert, and the crypto backstop can never disagree.
//
// Why this exists: the previous UI guard was a shallow format regex that accepted
// MAINNET addresses (`bc1…`/`1…`/`3…`) even though the app is testnet-only, and
// the send path only checked `toAddress` was truthy. A wrong-network or mistyped
// address was therefore caught only by @scure/btc-signer late, at build time. That
// still can't lose funds (the build throws before broadcast), but it's late and
// the error is opaque. This makes the failure early, network-correct, and legible.
import { Address } from '@scure/btc-signer';
import { listEnabledBtcNetworks } from './networks.js';

/**
 * @returns {boolean} true iff `address` is a checksum-valid Bitcoin address for an
 * ENABLED network. Network-aware: while the app is testnet-only this rejects
 * mainnet `bc1…`/`1…`/`3…` (mainnet params are not in the enabled set until
 * ALLOW_BTC_MAINNET). Pass an explicit `paramsList` (e.g. `[net.params]`) to
 * validate against specific networks; otherwise all enabled networks are tried.
 */
export function isValidBtcAddress(address, paramsList) {
  if (!address || typeof address !== 'string') return false;
  const networks = paramsList && paramsList.length
    ? paramsList
    : listEnabledBtcNetworks().map((n) => n.params);
  for (const params of networks) {
    try {
      Address(params).decode(address);
      return true;
    } catch {
      /* try the next enabled network */
    }
  }
  return false;
}

/**
 * Throwing variant for the send path — fail early, before any UTXO/fee fetch, with
 * a clear message rather than an opaque library throw deep in tx building.
 * @param {string} address
 * @param {object} params - a @scure/btc-signer network params set (e.g. net.params)
 */
export function assertValidBtcAddress(address, params) {
  if (!isValidBtcAddress(address, params ? [params] : undefined)) {
    throw new Error('Invalid Bitcoin recipient address for this network');
  }
}
