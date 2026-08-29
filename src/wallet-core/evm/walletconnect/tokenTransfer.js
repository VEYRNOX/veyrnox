// wallet-core/evm/walletconnect/tokenTransfer.js
//
// Shared ERC-20 transfer/transferFrom calldata decoder for the WalletConnect
// consent path. ONE decoder consumed by both the approval modal (display) and
// any pre-sign enforcement (spend-limit gate), so what the user sees and what
// the wallet enforces cannot drift.
//
// AUDIT CONTEXT — Strix retest 2026-08-29 (single-finding, Medium, CVSS 6.5):
// the approval modal previously rendered `transfer`/`transferFrom` calldata as
// a native-ETH send ("Value: 0.0 ETH") and never displayed the token recipient
// — the exact field a user must verify to defeat address-poisoning drainers.
// This module returns the decoded recipient AND amount so the modal can render
// dedicated rows, and flags non-registry tokens explicitly so an unknown-token
// send cannot masquerade as a zero-value native send (I4 fail-closed on
// display integrity).
//
// NO signing, NO keys, NO RPC — pure calldata inspection.

import { formatUnits, getAddress, isAddress } from 'ethers';
import { TOKENS } from '../tokens.js';

const TRANSFER_SELECTOR = '0xa9059cbb';       // transfer(address,uint256)
const TRANSFER_FROM_SELECTOR = '0x23b872dd';   // transferFrom(address,address,uint256)

// Fixed-width decoder — refuses malformed calldata rather than guessing. Every
// arg is a 32-byte word; addresses live in the low 20 bytes of their word.
function readAddressWord(hexNo0x, wordIndex) {
  const start = wordIndex * 64;
  const word = hexNo0x.slice(start, start + 64);
  if (word.length !== 64) return null;
  // Reject any non-zero byte in the top 12 bytes — that is not a valid address
  // ABI encoding and is the shape used to smuggle payloads past a lax decoder.
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(word)) return null;
  try {
    return getAddress('0x' + word.slice(24));
  } catch {
    return null;
  }
}

function readUintWord(hexNo0x, wordIndex) {
  const start = wordIndex * 64;
  const word = hexNo0x.slice(start, start + 64);
  if (word.length !== 64) return null;
  try {
    return BigInt('0x' + word);
  } catch {
    return null;
  }
}

/**
 * Look up a token registry entry by chain-key + contract address (case-insensitive).
 * Returns null when the contract is not in the verified registry — the caller
 * MUST treat that as "unknown token, do not assume decimals".
 */
export function lookupRegistryToken(networkKey, contractAddress) {
  if (!networkKey || !contractAddress || !isAddress(contractAddress)) return null;
  const bucket = TOKENS[networkKey];
  if (!bucket) return null;
  const wanted = contractAddress.toLowerCase();
  for (const symbol of Object.keys(bucket)) {
    const t = bucket[symbol];
    if (t?.address && t.address.toLowerCase() === wanted) return t;
  }
  return null;
}

/**
 * Decode an `eth_sendTransaction` param object for ERC-20 transfer intent.
 *
 * @param {{ to?: string, data?: string }} txParam
 * @param {string|null|undefined} networkKey  e.g. 'mainnet', 'sepolia'
 * @returns {
 *   | null                                           // not an ERC-20 transfer call
 *   | { kind: 'transfer'|'transferFrom',
 *       recipient: string,                           // full checksummed address
 *       from: string|null,                           // only set for transferFrom
 *       rawAmount: bigint,                           // base units
 *       contract: string,                            // token contract address
 *       registryToken: object|null,                  // null iff unknown token
 *       amountText: string|null,                     // null iff unknown token
 *       symbol: string|null,                         // null iff unknown token
 *       isRegistryToken: boolean }
 * }
 */
export function describeWcTokenTransfer(txParam, networkKey) {
  const data = txParam?.data;
  const to = txParam?.to;
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null;
  if (typeof to !== 'string' || !isAddress(to)) return null;

  const selector = data.slice(0, 10).toLowerCase();
  const body = data.slice(10);

  let kind = null;
  let recipient = null;
  let from = null;
  let rawAmount = null;

  if (selector === TRANSFER_SELECTOR) {
    // transfer(address to, uint256 amount) — 2 words = 128 hex chars.
    if (body.length < 128) return null;
    recipient = readAddressWord(body, 0);
    rawAmount = readUintWord(body, 1);
    kind = 'transfer';
  } else if (selector === TRANSFER_FROM_SELECTOR) {
    // transferFrom(address from, address to, uint256 amount) — 3 words.
    if (body.length < 192) return null;
    from = readAddressWord(body, 0);
    recipient = readAddressWord(body, 1);
    rawAmount = readUintWord(body, 2);
    kind = 'transferFrom';
  } else {
    return null;
  }

  if (recipient == null || rawAmount == null) return null;

  const contract = getAddress(to);
  const registryToken = lookupRegistryToken(networkKey, contract);
  const isRegistryToken = registryToken != null;

  return {
    kind,
    recipient,
    from,
    rawAmount,
    contract,
    registryToken,
    isRegistryToken,
    amountText: isRegistryToken ? formatUnits(rawAmount, registryToken.decimals) : null,
    symbol: isRegistryToken ? registryToken.symbol : null,
  };
}
