// @ts-nocheck
// wallet-core/evm/approvals.js
//
// ERC-20 allowance VIEW + REVOKE (Phase S2 — transaction safety).
//
// Unlimited/standing approvals are the #1 wallet-drain vector: a user grants a
// spender contract the right to move their tokens, the contract (or a later
// exploit of it) drains the balance. This module lets the user SEE every
// allowance and REVOKE it by setting it back to zero.
//
// SECURITY RATIONALE
//   - NO new key cryptography. Same EVM keys, same m/44'/60' derivation, same
//     LOCAL signing as Phase A/B. `privateKey` is supplied transiently by the
//     caller (useWallet().withPrivateKey) and is never persisted or logged —
//     identical to token-send.js's sendToken().
//   - chainId is re-verified against the intended network before broadcast
//     (wrong-chain / replay protection), mirroring the native + token send paths.
//   - This module only ever REDUCES an allowance to ZERO. It deliberately does
//     NOT expose a general approve(spender, amount) broadcast: granting (and
//     especially granting UNLIMITED) is the dangerous direction and stays out of
//     wallet-core, exactly as token-send.js withholds approve(). Revoke-to-zero
//     is the safe complement and can never become an unlimited-approval vector.
//   - Every revoke decodes the calldata it is about to sign through the SAME
//     describeErc20Call() the confirm screen uses (calldata.js), and refuses to
//     broadcast unless it decodes to a true zero-allowance approve. The display
//     of "UNLIMITED" in the list reuses that decoder too, so the user sees the
//     allowance classified identically everywhere.
//   - Mainnet stays gated: getNetwork()/getProvider() throw for any non-testnet
//     until ALLOW_MAINNET, so a revoke can only ever touch testnet funds today.

import { Contract, Interface, Wallet, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { getToken, ERC20_ABI } from './tokens.js';
import { describeErc20Call } from './calldata.js';

const erc20Interface = new Interface(ERC20_ABI);

/**
 * Encode `approve(spender, value)` calldata. `value` is a bigint of base units.
 * NOTE: the token contract address is the transaction's `to`, never part of the
 * calldata — so this is registry-independent and safe to call for display even
 * when a token isn't in the pinned registry.
 * @returns {string} 0x-prefixed calldata
 */
export function encodeApprove(spender, value) {
  if (!isAddress(spender)) throw new Error('Invalid spender address');
  return erc20Interface.encodeFunctionData('approve', [spender, value]);
}

/**
 * Build the REVOKE calldata — `approve(spender, 0)` — WITHOUT broadcasting, and
 * self-check it by decoding through calldata.js. Exposed so the UI can show the
 * user EXACTLY what will be signed (a zero-allowance approve) before confirming.
 * Throws if the decode is anything other than a true zero approve.
 * @returns {{ data: string, value: bigint, summary: object }}
 */
export function buildRevokeCalldata({ spender, tokenSymbol, decimals = 18 }) {
  const data = encodeApprove(spender, 0n);
  const summary = describeErc20Call({ data, tokenSymbol, decimals });
  if (summary.kind !== 'approve' || summary.unlimited || Number(summary.amount) !== 0) {
    // Defense-in-depth: never sign something that doesn't decode to a 0 approve.
    throw new Error('Revoke calldata self-check failed (not a zero-allowance approve)');
  }
  return { data, value: 0n, summary };
}

/**
 * Classify an existing allowance for DISPLAY, reusing the SAME calldata decoder
 * the confirm screen uses — so "UNLIMITED" is flagged identically everywhere.
 * Accepts the raw on-chain allowance (bigint or decimal string of base units).
 * @returns {object} describeErc20Call summary: { kind, spender, amount, unlimited, warning }
 */
export function summarizeAllowance({ rawAmount, spender, tokenSymbol, decimals = 18 }) {
  const value = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  // Display-only: if the spender isn't a valid address, encode against the zero
  // address purely so the decoder can classify the amount (the row still renders).
  const encodeSpender = isAddress(spender)
    ? spender
    : '0x0000000000000000000000000000000000000000';
  const data = erc20Interface.encodeFunctionData('approve', [encodeSpender, value]);
  return describeErc20Call({ data, tokenSymbol, decimals });
}

/**
 * Read the LIVE allowance(owner -> spender) from the chain (source of truth).
 * Cross-checks the contract's on-chain decimals() against the pinned registry
 * value (a mismatch throws rather than mis-scaling), mirroring token-send.js.
 * @returns {Promise<bigint>} allowance in base units
 */
export async function getAllowance({ networkKey, symbol, owner, spender }) {
  if (!isAddress(owner)) throw new Error('Invalid owner address');
  if (!isAddress(spender)) throw new Error('Invalid spender address');
  const provider = getProvider(networkKey);     // throws if mainnet gated / disabled
  const t = getToken(networkKey, symbol);       // throws if unconfigured/unverified
  const c = new Contract(t.address, ERC20_ABI, provider);
  const [raw, onchainDecimals] = await Promise.all([c.allowance(owner, spender), c.decimals()]);
  if (Number(onchainDecimals) !== t.decimals) {
    throw new Error(
      `Decimals mismatch for ${symbol}: configured ${t.decimals}, chain ${onchainDecimals}`
    );
  }
  return raw;
}

/**
 * Build + sign + broadcast `approve(spender, 0)` — the REVOKE. `privateKey` is
 * transient and never persisted. Mirrors sendToken(): same transient key, same
 * chainId guard, same local-sign-then-broadcast. The allowance is HARDCODED to
 * 0n, so this path can only ever reduce an allowance, never grant one.
 * @returns {Promise<{ hash: string, explorerUrl: string, summary: object, wait: Function }>}
 */
export async function sendRevoke({ networkKey, privateKey, symbol, spender }) {
  if (!isAddress(spender)) throw new Error('Invalid spender address');
  const net = getNetwork(networkKey);           // throws if mainnet gated / disabled
  const provider = getProvider(networkKey);
  const t = getToken(networkKey, symbol);

  const wallet = new Wallet(privateKey, provider);

  // Defense-in-depth: confirm the live network matches the intended chainId.
  const live = await provider.getNetwork();
  if (Number(live.chainId) !== net.chainId) {
    throw new Error(`Wrong network: provider chainId ${live.chainId}, expected ${net.chainId}`);
  }

  // Decode-and-verify the exact calldata we're about to sign (reuses calldata.js).
  const { summary } = buildRevokeCalldata({ spender, tokenSymbol: t.symbol, decimals: t.decimals });

  const c = new Contract(t.address, ERC20_ABI, wallet);
  const txResponse = await c.approve(spender, 0n); // signed LOCALLY + broadcast

  return {
    hash: txResponse.hash, // REAL hash from the network
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    summary,
    wait: (n = 1) => txResponse.wait(n),
  };
}
