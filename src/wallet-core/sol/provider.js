// wallet-core/sol/provider.js
//
// UNTRUSTED Solana JSON-RPC client (@solana/web3.js Connection). Used for READS
// and BROADCAST only — it never sees a private key and cannot forge an ed25519
// signature (signing is local in send.js).
//
// SECURITY RATIONALE — identical posture to the EVM provider and BTC indexer:
//   - The RPC is treated as hostile infrastructure. A malicious/buggy RPC can:
//     lie about a balance (display only), inflate the rent/fee numbers (the user
//     sees the amount before signing; the send-path rent guard is computed
//     locally from RPC-reported minimums but the worst case is a REJECTED send,
//     never lost funds), hand out a stale blockhash (the tx simply expires —
//     handled with a refetch/retry in send.js), or refuse to broadcast (the tx
//     doesn't send). It CANNOT move funds.
//   - The endpoint is overridable so an operator can point at their own RPC.
//   - 'confirmed' commitment is used for reads/confirmation: a sane balance
//     between speed and finality on devnet. Spendable balance is the confirmed
//     balance; we do not count unconfirmed/processed lamports.

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getSolNetwork, getSolNetworkInfo } from './networks.js';

export { LAMPORTS_PER_SOL };

const _overrides = {}; // networkKey -> rpcUrl
const _connections = {}; // networkKey -> Connection (memoized per resolved URL)

/** Operator override for a network's RPC URL. Pass null to clear. */
export function setSolRpcUrl(networkKey, url) {
  if (url) _overrides[networkKey] = url.replace(/\/$/, '');
  else delete _overrides[networkKey];
  delete _connections[networkKey]; // force a rebuild against the new URL
}

// Resolve the RPC URL WITHOUT the mainnet gate (reads are display-only and the
// gate is enforced at the broadcast path). Broadcast re-checks the gate.
function rpcUrl(networkKey) {
  const net = getSolNetworkInfo(networkKey);
  if (!net) throw new Error(`Unknown Solana network: ${networkKey}`);
  return _overrides[networkKey] || net.defaultRpcUrl;
}

/** Memoized Connection for a network (rebuilt if the override URL changes). */
export function getConnection(networkKey) {
  if (!_connections[networkKey]) {
    _connections[networkKey] = new Connection(rpcUrl(networkKey), 'confirmed');
  }
  return _connections[networkKey];
}

/**
 * Confirmed balance in lamports (BigInt). lamports are integers (1 SOL = 1e9
 * lamports); we keep them as BigInt to avoid float rounding on lamport math.
 * @returns {Promise<bigint>}
 */
export async function getBalanceLamports(networkKey, address) {
  const conn = getConnection(networkKey);
  const lamports = await conn.getBalance(new PublicKey(address), 'confirmed');
  return BigInt(lamports);
}

/** Convenience: confirmed balance as a SOL number (display only). */
export async function getBalanceSol(networkKey, address) {
  return Number(await getBalanceLamports(networkKey, address)) / LAMPORTS_PER_SOL;
}

/**
 * Fetch a FRESH recent blockhash plus the block height after which it expires.
 * Solana txs reference a recent blockhash and silently stop being accepted once
 * it expires (~60-90s); send.js fetches this at send time and uses
 * lastValidBlockHeight to detect/handle expiry. Returns BOTH so the caller can
 * confirm-with-deadline rather than guess.
 * @returns {Promise<{ blockhash: string, lastValidBlockHeight: number }>}
 */
export async function getLatestBlockhash(networkKey) {
  const conn = getConnection(networkKey);
  return conn.getLatestBlockhash('confirmed');
}

/**
 * Rent-exemption minimum (lamports, BigInt) for an account of `space` bytes. A
 * plain SOL (system) account is 0 bytes of data. An account holding less than
 * this can be purged by the runtime, so transfers must not strand a balance
 * below it (see send.js / planSolTransfer).
 * @param {number} [space=0]
 * @returns {Promise<bigint>}
 */
export async function getRentExemptMinimum(networkKey, space = 0) {
  const conn = getConnection(networkKey);
  const lamports = await conn.getMinimumBalanceForRentExemption(space, 'confirmed');
  return BigInt(lamports);
}

/**
 * Per-signature base fee (lamports, BigInt) for the network. A simple native
 * transfer has one signature. Read from the RPC's fee governor; falls back to
 * the well-known 5000 lamports/signature default if the RPC omits it.
 * @returns {Promise<bigint>}
 */
export async function getLamportsPerSignature(networkKey) {
  const conn = getConnection(networkKey);
  try {
    const { blockhash } = await conn.getLatestBlockhash('confirmed');
    const info = await conn.getFeeCalculatorForBlockhash(blockhash, 'confirmed');
    const lps = info?.value?.lamportsPerSignature;
    if (lps != null && Number.isFinite(Number(lps))) return BigInt(lps);
  } catch {
    /* fall through to the default */
  }
  return 5000n; // documented Solana default base fee per signature
}

/**
 * Broadcast a fully-signed, serialized transaction (raw bytes). RE-ENFORCES the
 * mainnet gate here via getSolNetwork() — broadcasting is the irreversible
 * action, so even if a read path resolved a mainnet URL, no mainnet tx can be
 * pushed while gated. Does NOT skip preflight (let the RPC reject obviously-bad
 * txs before they cost a fee).
 * @param {string} networkKey
 * @param {Uint8Array|Buffer} rawTx - serialized signed transaction.
 * @returns {Promise<string>} the transaction signature.
 */
export async function broadcastRawTx(networkKey, rawTx) {
  getSolNetwork(networkKey); // throws if mainnet gated / disabled
  const conn = getConnection(networkKey);
  return conn.sendRawTransaction(rawTx, { skipPreflight: false, preflightCommitment: 'confirmed' });
}

/**
 * Confirm a transaction against a blockhash deadline. Resolves when confirmed;
 * THROWS if the blockhash expires before confirmation (TransactionExpired…),
 * which send.js catches to drive its refetch/retry. Pull the gate first so this
 * isn't usable as a backdoor confirmation path on a gated network.
 */
export async function confirmTx(networkKey, signature, blockhash, lastValidBlockHeight) {
  const conn = getConnection(networkKey);
  return conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
}
