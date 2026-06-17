// src/lib/sendDispatch.js
//
// Pure, framework-free helpers that let SendCrypto.jsx dispatch a send across the
// EVM / BTC / Solana families with one code path's worth of TESTABLE logic. No
// React, no network, no crypto — just (1) converting the human-entered decimal
// amount to a chain's integer base unit without floating-point error, and (2)
// normalizing each family's distinct send-result shape to one record shape.

import { assertDecimalAmount } from '../wallet-core/amount.js';

/**
 * Convert a decimal amount STRING to integer base units (BTC->sats at 8 decimals,
 * SOL->lamports at 9) using BigInt only — never floating point, which loses
 * precision at 8-9 decimals. THROWS (never silently truncates) on a malformed,
 * non-positive, or over-precise amount.
 *
 * @param {string} amountStr human amount, e.g. "0.0005"
 * @param {number} decimals  base-unit decimals for the asset (BTC 8, SOL 9)
 * @returns {bigint} amount in integer base units
 */
export function toBaseUnits(amountStr, decimals) {
  // Shared validation rule (the same one the EVM send path now uses) — see
  // wallet-core/amount.js. Throws on malformed / non-positive / over-precise input.
  const s = assertDecimalAmount(amountStr, decimals);
  const [whole = '', frac = ''] = s.split('.');
  return BigInt((whole || '0') + frac.padEnd(decimals, '0'));
}

/**
 * Normalize a family's send result to one shape: { hash, explorerUrl }. EVM/ERC-20
 * return `hash`; BTC returns `txid`; SOL returns `signature`. THROWS on an unknown
 * family so a new family can never silently record an undefined hash.
 *
 * @param {string} family one of 'evm' | 'erc20' | 'btc' | 'solana'
 * @param {object} raw    the family send function's return value
 * @returns {{ hash: string, explorerUrl: string }}
 */
export function normalizeSendResult(family, raw) {
  switch (family) {
    case 'evm':
    case 'erc20':
      return { hash: raw.hash, explorerUrl: raw.explorerUrl };
    case 'btc':
      return { hash: raw.txid, explorerUrl: raw.explorerUrl };
    case 'solana':
      return { hash: raw.signature, explorerUrl: raw.explorerUrl };
    default:
      throw new Error(`Unknown asset family for send result: ${family}`);
  }
}
