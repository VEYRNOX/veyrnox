// wallet-core/evm/calldata.js
//
// Calldata decode + approval guard — the SECURITY HEART of the token phase.
//
// Token wallets drain users not through the contract calls themselves but
// through blind signing: a user approves "some transaction" without seeing that
// it grants UNLIMITED spend to an attacker's contract. This module turns opaque
// calldata into a structured, human-verifiable summary that the UI MUST show on
// the confirm screen BEFORE any signature.
//
// This file performs NO signing and holds NO keys — it only inspects bytes — but
// it lives under the guarded wallet-core path so the RNG tripwire covers it too.

import { Interface, formatUnits, MaxUint256 } from 'ethers';
import { ERC20_ABI } from './tokens.js';

const iface = new Interface(ERC20_ABI);

// Anything at or above half of 2^256 is, for any real token supply, effectively
// infinite — the canonical "unlimited approval" pattern (MaxUint256 and the
// common `2^256 - 1`). Treat it as UNLIMITED and warn loudly.
const UNLIMITED_THRESHOLD = MaxUint256 / 2n;

/**
 * Decode an outgoing tx's ERC-20 calldata into a summary the UI displays before
 * signing. Never throws on unknown data — returns { kind: 'unknown' } so the UI
 * can refuse / warn rather than crash.
 *
 * @param {{ data: string, tokenSymbol?: string, decimals?: number }} args
 * @returns {object} structured summary; for `approve`, includes `unlimited` and
 *                   a `warning` string when the approval is effectively infinite.
 */
export function describeErc20Call({ data, tokenSymbol, decimals = 18 }) {
  let parsed;
  try {
    parsed = iface.parseTransaction({ data });
  } catch {
    return { kind: 'unknown', raw: data };
  }
  if (!parsed) return { kind: 'unknown', raw: data };

  if (parsed.name === 'transfer') {
    const [to, amount] = parsed.args;
    return {
      kind: 'transfer',
      to,
      amount: formatUnits(amount, decimals),
      tokenSymbol,
    };
  }

  if (parsed.name === 'approve') {
    const [spender, amount] = parsed.args;
    const unlimited = amount >= UNLIMITED_THRESHOLD;
    return {
      kind: 'approve',
      spender,
      amount: unlimited ? 'UNLIMITED' : formatUnits(amount, decimals),
      unlimited,
      tokenSymbol,
      warning: unlimited
        ? `This grants UNLIMITED spending of your ${tokenSymbol || 'tokens'} to the spender. ` +
          'Only approve contracts you fully trust, and prefer an exact-amount approval.'
        : null,
    };
  }

  // A decoded-but-unhandled function (e.g. allowance/balanceOf would never be a
  // signed tx). Surface the name + args so the UI can show "unrecognised action".
  return { kind: parsed.name, args: parsed.args, tokenSymbol };
}
