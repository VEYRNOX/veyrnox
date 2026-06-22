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
import { assertSafeRpcUrl } from '../netUrl.js';

export { LAMPORTS_PER_SOL };

const _overrides = {}; // networkKey -> rpcUrl
const _connections = {}; // networkKey -> Connection (memoized per resolved URL)

/** Operator override for a network's RPC URL. Pass null to clear. */
export function setSolRpcUrl(networkKey, url) {
  if (url) _overrides[networkKey] = assertSafeRpcUrl(url).replace(/\/$/, '');
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
 * Per-signature base fee (lamports, BigInt). A simple native transfer has one
 * signature. Solana's base fee has been a fixed 5000 lamports/signature since
 * genesis; the on-chain fee governor that could change it has never been activated.
 * The old getFeeCalculatorForBlockhash RPC is deprecated and returns a null value
 * on modern validators, so the previous code silently fell back to this same
 * constant after a dead round-trip. We return the protocol constant directly; a
 * live reading would use getFeeForMessage against a compiled Message (see
 * simulate.js) if/when the governor is ever activated. `_networkKey` is accepted
 * (callers pass it) but unused — the base fee is network-independent.
 * @returns {Promise<bigint>}
 */
export async function getLamportsPerSignature(_networkKey) {
  return 5000n;
}

/**
 * Median recent prioritization fee (micro-lamports per compute unit) from the
 * SAME Connection/RPC used for everything else — NO new data source. Solana's
 * priority fee is market-set: getRecentPrioritizationFees() returns the per-slot
 * fees paid recently; the median is a representative rate. Read-only and
 * gate-free (display/estimation only; the gate is enforced on broadcast).
 *
 * Returns null (NOT 0) if the RPC is unreachable or returns nothing, so the UI
 * can show "—" for the priority cell while the fixed base fee still renders. On
 * an idle testnet a real ~0 is legitimate and returned as 0.
 * @returns {Promise<number|null>} micro-lamports per CU, or null if unavailable.
 */
export async function getRecentPrioritizationFee(networkKey) {
  const conn = getConnection(networkKey);
  try {
    const fees = await conn.getRecentPrioritizationFees();
    if (!Array.isArray(fees) || !fees.length) return null;
    const vals = fees
      .map((f) => f.prioritizationFee)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    return vals[Math.floor(vals.length / 2)]; // median
  } catch {
    return null;
  }
}

/**
 * Read an address's recent transaction history from the SAME RPC used for
 * balance/blockhash/broadcast — NO new data source. Two-step, both read-only and
 * gate-free (the gate is enforced on broadcast): getSignaturesForAddress() lists
 * recent signatures, then getParsedTransactions() pulls each so the caller can
 * compute the per-account balance delta and counterparty locally. A lying RPC can
 * at worst show a wrong/empty list (display only), never move funds.
 *
 * PRIVACY: this is a phone-home/deanonymization surface — the RPC learns the
 * queried address and that this client is watching it. Runs ONLY on demand (when
 * the user opens this address's history), never in the background, and the
 * endpoint is overridable via setSolRpcUrl() so an operator can point at their own
 * RPC. See src/lib/txHistory.js for the normalization + user-facing disclosure.
 *
 * @param {string} networkKey
 * @param {string} address - base58 account
 * @param {{ limit?: number }} [opts] - max signatures to pull (default 25)
 * @returns {Promise<Array<{ signature: object, parsed: object|null }>>}
 *   signature = ConfirmedSignatureInfo (has err, blockTime, confirmationStatus),
 *   parsed = ParsedTransactionWithMeta or null if the RPC dropped it.
 */
export async function getAddressHistory(networkKey, address, { limit = 25 } = {}) {
  const conn = getConnection(networkKey);
  const pubkey = new PublicKey(address);
  const sigs = await conn.getSignaturesForAddress(pubkey, { limit });
  if (!sigs.length) return [];
  const parsed = await conn.getParsedTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0 },
  );
  return sigs.map((signature, i) => ({ signature, parsed: parsed[i] || null }));
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

/**
 * Did a broadcast signature actually land on-chain? Used by send.js BEFORE it
 * rebuilds-and-resends on a blockhash-expiry error (internal audit M-1): a
 * `TransactionExpired*` from confirmTx only means the client stopped observing
 * before the deadline — NOT that the tx was excluded. Rebuilding produces a fresh
 * signature, so resending after a silent inclusion would DOUBLE-SEND. This checks
 * the just-broadcast signature's status (searching tx history) so the caller only
 * rebuilds when inclusion is genuinely absent.
 *
 * Returns:
 *   { landed: true,  err }  — found on-chain (err is the on-chain error or null)
 *   { landed: false, err: null } — definitively not found (safe to rebuild)
 *   { landed: null,  err: null } — could NOT determine (RPC failed): caller MUST
 *                                  treat as "do not risk a resend", not as absent.
 * @param {string} networkKey
 * @param {string} signature
 * @returns {Promise<{landed: boolean|null, err: unknown}>}
 */
export async function getSignatureLanding(networkKey, signature) {
  try {
    const conn = getConnection(networkKey);
    const { value } = await conn.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (value == null) return { landed: false, err: null };
    return { landed: true, err: value.err ?? null };
  } catch {
    return { landed: null, err: null }; // uncertain — never assume non-inclusion
  }
}
