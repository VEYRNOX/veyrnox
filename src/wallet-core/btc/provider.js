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

/**
 * Recommended fee rate in sat/vByte for a target confirmation. Esplora returns a
 * map of {blocks: sat/vB}. We clamp to a >=1 sat/vB floor (testnet often reports
 * fractional/zero rates that would build a non-relayable tx).
 * @returns {Promise<number>} sat/vByte (integer, >= 1)
 */
export async function getFeeRate(networkKey, targetBlocks = 6) {
  let estimates;
  try {
    estimates = await getJson(`${baseUrl(networkKey)}/fee-estimates`);
  } catch {
    estimates = null;
  }
  const raw = estimates?.[String(targetBlocks)] ?? estimates?.['6'] ?? estimates?.['1'];
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 1) return 1; // sane testnet floor
  return Math.ceil(rate);
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
