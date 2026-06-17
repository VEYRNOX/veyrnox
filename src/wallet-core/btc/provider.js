// wallet-core/btc/provider.js
//
// UNTRUSTED Bitcoin data source (Esplora/mempool.space-compatible REST API).
// Unlike EVM JSON-RPC, a UTXO wallet needs a UTXO-aware indexer to: list an
// address's UTXOs, estimate fees (sat/vByte), and broadcast a raw tx.
//
// SECURITY RATIONALE — identical posture to the EVM provider:
//   - The indexer is treated as hostile infrastructure. It is used for READS
//     and BROADCAST only. It never sees a private key and cannot forge a
//     signature (signing is local in send.js).
//   - A malicious/buggy indexer can: hide UTXOs (you under-spend — safe), lie
//     about a balance (display only), inflate fee estimates (we clamp to a sane
//     floor and the user sees the fee before signing), or refuse to broadcast
//     (the tx simply doesn't send). It CANNOT cause us to lose change: the
//     change output is computed locally from the actual selected input values
//     (see coinselect.js), not from any indexer-reported total.
//   - The endpoint is overridable so an operator can point at their own
//     Esplora/Electrs instance instead of a public one.
//
// Esplora REST shape (Blockstream/mempool.space):
//   GET  {base}/address/:addr/utxo   -> [{ txid, vout, value, status:{confirmed,...} }]
//   GET  {base}/address/:addr/txs    -> [{ txid, vin[], vout[], fee, status:{…} }]
//   GET  {base}/fee-estimates        -> { "1": sat/vB, "6": …, "144": … }
//   POST {base}/tx  (raw hex body)   -> txid (text)
//   GET  {base}/tx/:txid             -> tx detail (used to confirm)

import { getBtcNetwork, getBtcNetworkInfo } from './networks.js';

const _overrides = {}; // networkKey -> esploraUrl

/** Operator override for a network's indexer URL. Pass null to clear. */
export function setEsploraUrl(networkKey, url) {
  if (url) _overrides[networkKey] = url.replace(/\/$/, '');
  else delete _overrides[networkKey];
}

// Resolve the base URL WITHOUT the mainnet gate (reads are display-only and the
// gate is enforced at the send path). Broadcast re-checks the gate explicitly.
function baseUrl(networkKey) {
  const net = getBtcNetworkInfo(networkKey);
  if (!net) throw new Error(`Unknown Bitcoin network: ${networkKey}`);
  return _overrides[networkKey] || net.defaultEsploraUrl;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Indexer ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch spendable UTXOs for an address. Returns normalized entries with `value`
 * as a BigInt of satoshis (BigInt end-to-end avoids float rounding on sat math).
 * @returns {Promise<Array<{ txid:string, vout:number, value:bigint, confirmed:boolean }>>}
 */
export async function getUtxos(networkKey, address) {
  const raw = await getJson(`${baseUrl(networkKey)}/address/${address}/utxo`);
  if (!Array.isArray(raw)) throw new Error('Indexer returned a non-array UTXO set');
  return raw.map(u => ({
    txid: u.txid,
    vout: u.vout,
    value: BigInt(u.value),
    confirmed: !!u.status?.confirmed,
  }));
}

/**
 * Read an address's transaction history from the SAME Esplora indexer used for
 * UTXOs/fees/broadcast — NO new data source. Read-only and gate-free (the gate
 * is enforced on the broadcast path); a lying indexer can at worst show a wrong
 * or empty list (display only), never move funds.
 *
 * PRIVACY: this is a phone-home/deanonymization surface — the indexer learns the
 * queried address and that this client is watching it. It runs ONLY on demand
 * (when the user opens this address's history), never in the background, and the
 * endpoint is overridable via setEsploraUrl() so an operator can point at their
 * own Esplora/Electrs (or a Tor route). See src/lib/txHistory.js for the
 * normalization + the user-facing disclosure.
 *
 * Returns Esplora's raw confirmed tx objects (newest first). Esplora paginates at
 * 25 confirmed txs per call after an initial mempool batch; we take the first
 * page (the recent history a wallet UI shows) rather than walking all pages.
 * @returns {Promise<Array<object>>} raw Esplora tx objects
 */
export async function getAddressTxs(networkKey, address) {
  const raw = await getJson(`${baseUrl(networkKey)}/address/${address}/txs`);
  if (!Array.isArray(raw)) throw new Error('Indexer returned a non-array tx list');
  return raw;
}

/**
 * Confirmed spendable balance, in satoshis (BigInt). Unconfirmed UTXOs are
 * EXCLUDED by default so the spendable balance can't be inflated by an
 * unconfirmed (potentially-replaceable) deposit. Pass includeUnconfirmed=true
 * for a display "pending" total.
 */
export async function getBalanceSats(networkKey, address, includeUnconfirmed = false) {
  const utxos = await getUtxos(networkKey, address);
  return utxos.reduce(
    (sum, u) => (u.confirmed || includeUnconfirmed ? sum + u.value : sum),
    0n,
  );
}

// Upper bound on the indexer-reported fee rate (internal audit H-1). The Esplora
// indexer is UNTRUSTED; without a ceiling a malicious/compromised one could return
// e.g. 500000 sat/vB and we would build a transaction that pays it, draining the
// UTXO as fee. 1000 sat/vB is far above any legitimate rate (even peak mainnet
// congestion rarely exceeds a few hundred; testnet is ~1), so clamping here cannot
// underprice a real send but bounds the catastrophic-overpay case. This is a
// wallet-core backstop; the per-send fee preview + fee-vs-amount approval in the
// confirm UI (H-1/M-2) is the complementary user-facing control.
export const MAX_FEE_RATE = 1000;

/**
 * PURE: clamp an indexer-reported fee rate to the safe band [1, MAX_FEE_RATE].
 * Extracted so the security-relevant bounds (untrusted-indexer ceiling, H-1) are
 * unit-testable without network. A non-finite / sub-1 rate floors to 1 (testnet
 * often reports fractional/zero rates that build a non-relayable tx); anything
 * above the ceiling clamps down (a hostile indexer cannot dictate a drain-as-fee).
 * @param {unknown} raw
 * @returns {number} integer sat/vByte, 1 <= rate <= MAX_FEE_RATE
 */
export function clampFeeRate(raw) {
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 1) return 1;
  return Math.min(Math.ceil(rate), MAX_FEE_RATE);
}

/**
 * Recommended fee rate in sat/vByte for a target confirmation. Esplora returns a
 * map of {blocks: sat/vB}; the result is clamped to [1, MAX_FEE_RATE] via
 * clampFeeRate (the indexer is untrusted — see above).
 * @returns {Promise<number>} sat/vByte (integer, 1 <= rate <= MAX_FEE_RATE)
 */
export async function getFeeRate(networkKey, targetBlocks = 6) {
  let estimates;
  try {
    estimates = await getJson(`${baseUrl(networkKey)}/fee-estimates`);
  } catch {
    estimates = null;
  }
  const raw = estimates?.[String(targetBlocks)] ?? estimates?.['6'] ?? estimates?.['1'];
  return clampFeeRate(raw);
}

/**
 * Broadcast a fully-signed raw transaction (hex). RE-ENFORCES the mainnet gate
 * here via getBtcNetwork() — broadcasting is the irreversible action, so even if
 * a read path resolved a mainnet URL, no mainnet tx can be pushed while gated.
 * @returns {Promise<string>} the broadcast txid
 */
export async function broadcastTx(networkKey, rawHex) {
  getBtcNetwork(networkKey); // throws if mainnet gated / disabled
  const url = `${baseUrl(networkKey)}/tx`;
  const res = await fetch(url, { method: 'POST', body: rawHex });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error(`Broadcast failed (${res.status}): ${text}`);
  return text; // txid
}
