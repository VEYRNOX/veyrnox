// lib/txHistory.js
//
// Transaction-history aggregation + normalization for the per-chain history view.
// READ-ONLY and display-only: it never signs, never broadcasts, never touches the
// vault. It pulls from the EXISTING provider layers (wallet-core/{btc,sol}/
// provider.js) — NO new data source, NO backend, NO analytics/telemetry.
//
// DATA SOURCE PER FAMILY (and the honest privacy posture of each):
//   - BTC    : the SAME Esplora indexer used for UTXOs/fees/broadcast
//              (mempool.space testnet/signet), GET /address/:addr/txs.
//   - Solana : the SAME JSON-RPC used for balance/broadcast (devnet/testnet),
//              getSignaturesForAddress + getParsedTransactions.
//   - EVM    : a plain JSON-RPC node has NO "list an address's transactions"
//              method (eth_* exposes none; ethers v6 dropped getHistory). Listing
//              EVM history REQUIRES a third-party explorer/indexer API (Etherscan,
//              Alchemy, …) — a NEW data source AND a phone-home surface. We add
//              neither, so in-app EVM history is intentionally UNSUPPORTED; we
//              surface a block-explorer link instead (a user-initiated lookup).
//
// PRIVACY WEDGE (documented honestly, surfaced in-app via getHistorySource):
//   Fetching history for an address tells the queried indexer/RPC *which address
//   you are watching* and that this client/IP is watching it — a deanonymization
//   surface. We minimize it: queries run ONLY on demand (when you open a chain's
//   history), never in the background; only the address being viewed is sent; and
//   every endpoint is operator-overridable (setEsploraUrl / setSolRpcUrl) so it
//   can point at your own node / a Tor route. The EVM JSON-RPC path leaks the
//   LEAST — it literally cannot answer the history query — which is why we don't
//   bolt a third-party indexer onto it just to fill the list. In demo mode NOTHING
//   is fetched: the rows below are clearly-labelled local sample data.

import { getAddressTxs } from '@/wallet-core/btc/provider';
import { getAddressHistory } from '@/wallet-core/sol/provider';
import { getBtcNetworkInfo } from '@/wallet-core/btc/networks';
import { getSolNetworkInfo, solExplorerUrl } from '@/wallet-core/sol/networks';
import { getNetworkInfo } from '@/wallet-core/evm/networks';

const SATS_PER_BTC = 100000000;
const LAMPORTS_PER_SOL = 1000000000;

// Trim a fixed-decimal string of trailing zeros (and a dangling dot) so amounts
// read cleanly (0.012, not 0.01200000) without losing precision we computed.
function trimAmount(s) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

const short = (a) => (a && a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a || '');

// ---------------------------------------------------------------------------
// DATA-SOURCE / PRIVACY DESCRIPTOR (drives the in-app disclosure banner)
// ---------------------------------------------------------------------------

/**
 * Describe where an asset's history comes from and what querying it discloses.
 * `supportsList` is false for EVM (no JSON-RPC history method); the UI then shows
 * the explorer fallback instead of an (impossible) in-app list.
 */
export function getHistorySource(asset) {
  const family = asset?.family;
  if (family === 'btc') {
    const net = getBtcNetworkInfo(asset.chain);
    return {
      family,
      supportsList: true,
      indexerLabel: 'Esplora indexer',
      indexer: net?.defaultEsploraUrl || '',
      explorerBase: net?.explorer || '',
      networkName: net?.name || asset.chain,
      // Honest phone-home note for this path.
      privacyNote:
        'Listing history queries the Esplora indexer (mempool.space) for this address — it learns the address and that you are watching it. On-demand only; override the endpoint to use your own Esplora/Electrs.',
    };
  }
  if (family === 'solana') {
    const net = getSolNetworkInfo(asset.chain);
    return {
      family,
      supportsList: true,
      indexerLabel: 'Solana RPC',
      indexer: net?.defaultRpcUrl || '',
      explorerBase: net?.explorer || '',
      networkName: net?.name || asset.chain,
      privacyNote:
        'Listing history queries the Solana RPC for this address — it learns the address and that you are watching it. On-demand only; override the endpoint to use your own RPC.',
    };
  }
  // evm / erc20
  const net = getNetworkInfo(asset.chain);
  return {
    family: 'evm',
    supportsList: false,
    indexerLabel: 'JSON-RPC node',
    indexer: net?.defaultRpcUrl || '',
    explorerBase: net?.explorer || '',
    networkName: net?.name || asset.chain,
    privacyNote:
      'A JSON-RPC node cannot list an address’s transactions, so nothing is queried for an in-app list — the most private outcome. We deliberately do NOT add a third-party explorer API (a new data source + phone-home surface). Use the explorer link for full history.',
  };
}

/** Block-explorer URL for an address on the asset's chain (for the EVM fallback). */
export function explorerAddressUrl(asset, address) {
  if (!address) return '';
  if (asset.family === 'btc') {
    const net = getBtcNetworkInfo(asset.chain);
    return net ? `${net.explorer}/address/${address}` : '';
  }
  if (asset.family === 'solana') {
    return solExplorerUrl(asset.chain, 'address', address);
  }
  const net = getNetworkInfo(asset.chain);
  return net ? `${net.explorer}/address/${address}` : '';
}

// ---------------------------------------------------------------------------
// NORMALIZERS (pure — unit-tested without any network)
// ---------------------------------------------------------------------------

/**
 * Normalize one raw Esplora tx (from getAddressTxs) for `address`. Direction and
 * magnitude are computed from the wallet's net balance change: value received in
 * our outputs minus value spent from our inputs. |net| is the balance impact the
 * user cares about (for a send this is recipient + fee). BTC txs don't "fail" —
 * they're pending until a block confirms them — so status is pending|confirmed.
 */
export function normalizeBtcTx(tx, address, networkKey) {
  if (!tx || !tx.txid) return null;
  let inFromUs = 0n;
  let outToUs = 0n;
  for (const vin of tx.vin || []) {
    if (vin?.prevout?.scriptpubkey_address === address) inFromUs += BigInt(vin.prevout.value || 0);
  }
  for (const vout of tx.vout || []) {
    if (vout?.scriptpubkey_address === address) outToUs += BigInt(vout.value || 0);
  }
  const net = outToUs - inFromUs; // >0 received, <0 sent
  const type = net > 0n ? 'receive' : net < 0n ? 'send' : 'self';

  let counterparty = null;
  if (type === 'send') {
    const out = (tx.vout || []).find((v) => v.scriptpubkey_address && v.scriptpubkey_address !== address);
    counterparty = out?.scriptpubkey_address || null;
  } else if (type === 'receive') {
    const vin = (tx.vin || []).find((v) => v.prevout?.scriptpubkey_address && v.prevout.scriptpubkey_address !== address);
    counterparty = vin?.prevout?.scriptpubkey_address || null;
  }

  const magnitude = net < 0n ? -net : net;
  const net_info = getBtcNetworkInfo(networkKey);
  const confirmed = !!tx.status?.confirmed;
  return {
    id: tx.txid,
    hash: tx.txid,
    family: 'btc',
    networkKey,
    assetSymbol: 'BTC',
    type,
    status: confirmed ? 'confirmed' : 'pending',
    amount: trimAmount((Number(magnitude) / SATS_PER_BTC).toFixed(8)),
    counterparty,
    timestamp: confirmed && tx.status?.block_time ? tx.status.block_time * 1000 : null,
    explorerUrl: net_info ? `${net_info.explorer}/tx/${tx.txid}` : '',
    demo: false,
  };
}

/**
 * Normalize one Solana entry (from getAddressHistory: { signature, parsed }) for
 * `address`. Magnitude/direction come from the account's lamport balance delta
 * (pre/post), which is reliable even when instruction parsing isn't; counterparty
 * is best-effort from a parsed system `transfer`. A non-null `err` => failed.
 */
export function normalizeSolEntry(entry, address, networkKey) {
  const sig = entry?.signature;
  if (!sig?.signature) return null;
  const parsed = entry.parsed;
  const failed = !!(sig.err || parsed?.meta?.err);

  let status;
  if (failed) status = 'failed';
  else if (sig.confirmationStatus === 'finalized' || sig.confirmationStatus === 'confirmed') status = 'confirmed';
  else status = 'pending';

  // Balance delta for our account (lamports). accountKeys index aligns with
  // pre/postBalances. Fee-payer deltas include the fee — fine for a display impact.
  let type = 'self';
  let lamports = 0;
  let counterparty = null;
  const msg = parsed?.transaction?.message;
  const meta = parsed?.meta;
  if (msg?.accountKeys && meta?.preBalances && meta?.postBalances) {
    const idx = msg.accountKeys.findIndex((k) => (k.pubkey || k) === address);
    if (idx >= 0) {
      const delta = (meta.postBalances[idx] || 0) - (meta.preBalances[idx] || 0);
      lamports = Math.abs(delta);
      type = delta > 0 ? 'receive' : delta < 0 ? 'send' : 'self';
    }
    for (const ix of msg.instructions || []) {
      if (ix?.program === 'system' && ix?.parsed?.type === 'transfer') {
        const info = ix.parsed.info || {};
        counterparty = info.source === address ? info.destination : info.source;
        break;
      }
    }
  }

  const blockTime = sig.blockTime ?? parsed?.blockTime ?? null;
  return {
    id: sig.signature,
    hash: sig.signature,
    family: 'solana',
    networkKey,
    assetSymbol: 'SOL',
    type,
    status,
    amount: trimAmount((lamports / LAMPORTS_PER_SOL).toFixed(9)),
    counterparty,
    timestamp: blockTime ? blockTime * 1000 : null,
    explorerUrl: solExplorerUrl(networkKey, 'tx', sig.signature),
    demo: false,
  };
}

// ---------------------------------------------------------------------------
// FETCH (on-demand; one chain at a time)
// ---------------------------------------------------------------------------

/**
 * Fetch + normalize an asset's history for `address`. Returns a uniform result
 * the page can render directly. NEVER throws for the EVM "no indexer" case — it
 * reports supported:false so the UI shows the explorer fallback. Real fetch
 * errors (indexer/RPC down) reject so React Query can show the error state.
 *
 * @param {{ asset: object, address: string|null, demo: boolean }} args
 * @returns {Promise<{ supported: boolean, demo?: boolean, reason?: string,
 *   source: object, transactions: Array<object> }>}
 */
export async function fetchAssetHistory({ asset, address, demo }) {
  const source = getHistorySource(asset);

  if (demo) {
    return { supported: true, demo: true, source, transactions: demoHistoryForAsset(asset) };
  }

  // EVM family: no JSON-RPC history method, and we won't add an indexer.
  if (source.family === 'evm') {
    return { supported: false, reason: 'evm-no-indexer', source, transactions: [] };
  }

  if (!address) {
    return { supported: true, reason: 'locked', source, transactions: [] };
  }

  if (asset.family === 'btc') {
    const raw = await getAddressTxs(asset.chain, address);
    const txs = raw.map((t) => normalizeBtcTx(t, address, asset.chain)).filter(Boolean);
    return { supported: true, source, transactions: txs };
  }

  // solana
  const entries = await getAddressHistory(asset.chain, address, { limit: 25 });
  const txs = entries.map((e) => normalizeSolEntry(e, address, asset.chain)).filter(Boolean);
  return { supported: true, source, transactions: txs };
}

// ---------------------------------------------------------------------------
// DEMO SEED — clearly-labelled local sample history (NOTHING is fetched)
// ---------------------------------------------------------------------------

// Deterministic pseudo-address/hash builder (NO RNG): expands a seed string into
// hex by mixing char codes. Plausible-looking, stable across renders/tests, and
// obviously fake (demo:true drives the "sample data" labelling in the UI).
function hex(seed, len) {
  const D = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) {
    const c = seed.charCodeAt(i % seed.length) || 7;
    out += D[(c * 7 + i * 13 + 5) % 16];
  }
  return out;
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(seed, len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    const c = seed.charCodeAt(i % seed.length) || 11;
    out += B58[(c * 5 + i * 17 + 9) % B58.length];
  }
  return out;
}

function demoCounterparty(asset, seed) {
  if (asset.family === 'btc') return `tb1q${hex(seed, 38)}`;
  if (asset.family === 'solana') return b58(seed, 44);
  return `0x${hex(seed, 40)}`;
}
function demoHash(asset, seed) {
  if (asset.family === 'solana') return b58(seed, 88);
  return `0x${hex(seed, 64)}`;
}

// Fixed ISO timestamps (absolute, like demoClient) so demo rows are deterministic
// and don't depend on the wall clock.
const DEMO_TS = [
  '2026-05-31T09:12:00Z',
  '2026-05-30T18:40:00Z',
  '2026-05-29T14:05:00Z',
  '2026-05-27T11:25:00Z',
  '2026-05-24T08:00:00Z',
];

// Per-asset demo magnitudes + a plausible 4-row mix. BTC never "fails"; EVM/SOL
// include one failed row to exercise that state.
const DEMO_AMOUNTS = {
  ETH: '0.5', USDC: '200', USDT: '150', MATIC: '320', ARB: '45',
  OP: '60', AVAX: '12.5', BNB: '1.5', BTC: '0.012', SOL: '3.2',
};

/**
 * Build clearly-labelled sample history for an asset (demo mode only). Rows carry
 * demo:true so the page can badge them as sample data; explorer links still point
 * at the right testnet explorer for the (fake) hash so the link UX is real.
 */
export function demoHistoryForAsset(asset) {
  const base = DEMO_AMOUNTS[asset.symbol] || '1.0';
  const amt = (m) => trimAmount((parseFloat(base) * m).toFixed(8));
  const source = getHistorySource(asset);
  const txUrl = (h) => {
    if (asset.family === 'solana') return solExplorerUrl(asset.chain, 'tx', h);
    return source.explorerBase ? `${source.explorerBase}/tx/${h}` : '';
  };
  // BTC: pending instead of failed (BTC txs don't fail); others include a failed row.
  const rows = [
    { type: 'receive', status: 'confirmed', mult: 1, s: `${asset.symbol}-recv-1` },
    { type: 'send', status: 'confirmed', mult: 0.5, s: `${asset.symbol}-send-1` },
    { type: 'receive', status: 'pending', mult: 0.25, s: `${asset.symbol}-recv-2` },
    asset.family === 'btc'
      ? { type: 'send', status: 'pending', mult: 0.1, s: `${asset.symbol}-send-2` }
      : { type: 'send', status: 'failed', mult: 0.1, s: `${asset.symbol}-fail-1` },
  ];
  return rows.map((r, i) => {
    const h = demoHash(asset, r.s);
    return {
      id: `demo-${asset.symbol}-${i}`,
      hash: h,
      family: asset.family,
      networkKey: asset.chain,
      assetSymbol: asset.symbol,
      type: r.type,
      status: r.status,
      amount: amt(r.mult),
      counterparty: demoCounterparty(asset, r.s),
      timestamp: r.status === 'pending' ? null : new Date(DEMO_TS[i % DEMO_TS.length]).getTime(),
      explorerUrl: txUrl(h),
      demo: true,
    };
  });
}
