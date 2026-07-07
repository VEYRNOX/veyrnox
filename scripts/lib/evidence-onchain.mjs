// scripts/lib/evidence-onchain.mjs
//
// Pure, network-free helpers for the on-chain evidence re-confirmation job
// (scripts/verify-onchain-evidence.mjs). Split out so the parsing, chain-mapping,
// and response-interpretation logic can be unit-tested hermetically — the CLI does
// only the actual fetch() + reporting on top of these functions.
//
// The single source of "verified" status is docs/verified-evidence.json. Its
// `evidence` map is feature -> { chain, txid, date }; keys starting with "_" are
// schema/META entries and MUST be skipped (they never promote a feature). This
// job re-checks that every referenced txid still confirms on-chain, so a "verified"
// claim can't quietly rot (re-org, wrong hash, explorer delisting).
//
// No dependencies beyond Node builtins. Pure ESM.

// Public RPC / API endpoints — all keyless, public nodes. Chain keys match the
// `chain` values used in docs/verified-evidence.json; ALIASES normalizes common
// synonyms so an evidence entry written as "amoy" or "fuji" still resolves.
export const CHAINS = Object.freeze({
  sepolia: { kind: 'evm', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.etherscan.io/tx/' },
  mainnet: { kind: 'evm', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io/tx/' },
  'polygon-amoy': { kind: 'evm', rpc: 'https://polygon-amoy-bor-rpc.publicnode.com', explorer: 'https://amoy.polygonscan.com/tx/' },
  'arbitrum-sepolia': { kind: 'evm', rpc: 'https://arbitrum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.arbiscan.io/tx/' },
  'optimism-sepolia': { kind: 'evm', rpc: 'https://optimism-sepolia-rpc.publicnode.com', explorer: 'https://sepolia-optimism.etherscan.io/tx/' },
  'avalanche-fuji': { kind: 'evm', rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com', explorer: 'https://testnet.snowtrace.io/tx/' },
  'bnb-testnet': { kind: 'evm', rpc: 'https://bsc-testnet-rpc.publicnode.com', explorer: 'https://testnet.bscscan.com/tx/' },
  'bitcoin-testnet': { kind: 'btc-esplora', api: 'https://blockstream.info/testnet/api', explorer: 'https://blockstream.info/testnet/tx/' },
  'solana-devnet': { kind: 'solana', rpc: 'https://api.devnet.solana.com', explorer: 'https://explorer.solana.com/tx/' },
  'solana-mainnet': { kind: 'solana', rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://explorer.solana.com/tx/' },
});

export const ALIASES = Object.freeze({
  ethereum: 'mainnet',
  'ethereum-mainnet': 'mainnet',
  eth: 'mainnet',
  amoy: 'polygon-amoy',
  'polygon-mumbai': 'polygon-amoy',
  fuji: 'avalanche-fuji',
  'avax-fuji': 'avalanche-fuji',
  'bsc-testnet': 'bnb-testnet',
  'bnb-chain-testnet': 'bnb-testnet',
  btc: 'bitcoin-testnet',
  'btc-testnet': 'bitcoin-testnet',
  solana: 'solana-devnet',
  devnet: 'solana-devnet',
});

export function normalizeChain(chain) {
  if (!chain) return null;
  const key = String(chain).trim().toLowerCase();
  return ALIASES[key] ?? key;
}

export function chainConfig(chain) {
  const key = normalizeChain(chain);
  return CHAINS[key] ?? null;
}

/**
 * Flatten docs/verified-evidence.json into checkable rows. Skips "_"-prefixed
 * META/schema keys and any entry missing a chain or txid.
 * @param {object} evidenceJson parsed verified-evidence.json
 * @returns {Array<{feature:string, chain:string, txid:string, date?:string}>}
 */
export function collectEvidence(evidenceJson) {
  const evidence = evidenceJson?.evidence ?? {};
  const rows = [];
  for (const [feature, v] of Object.entries(evidence)) {
    if (feature.startsWith('_')) continue;
    if (!v || typeof v !== 'object') continue;
    if (!v.chain || !v.txid) continue;
    rows.push({ feature, chain: v.chain, txid: v.txid, date: v.date });
  }
  return rows;
}

/**
 * Build the (pure) probe descriptor for a chain+txid. The CLI turns this into a
 * real fetch(). Returns null for an unknown chain.
 * @returns {null | {kind:string, url:string, method:'GET'|'POST', body?:string, headers?:object}}
 */
export function buildProbe(chain, txid) {
  const cfg = chainConfig(chain);
  if (!cfg) return null;
  if (cfg.kind === 'evm') {
    return {
      kind: 'evm',
      url: cfg.rpc,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txid] }),
    };
  }
  if (cfg.kind === 'btc-esplora') {
    return { kind: 'btc-esplora', url: `${cfg.api}/tx/${txid}`, method: 'GET' };
  }
  if (cfg.kind === 'solana') {
    return {
      kind: 'solana',
      url: cfg.rpc,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[txid], { searchTransactionHistory: true }],
      }),
    };
  }
  return null;
}

// Verdict constants. CONFIRMED = still good; FAILED = definitively not confirmed
// (reverted / not found) — a real regression; UNREACHABLE = we could not tell
// (network / parse error), handled softly by the CLI.
export const CONFIRMED = 'CONFIRMED';
export const FAILED = 'FAILED';
export const UNREACHABLE = 'UNREACHABLE';

/**
 * Interpret a parsed provider response into a verdict. Pure — takes already-parsed
 * JSON, never touches the network.
 * @param {string} kind 'evm' | 'btc-esplora' | 'solana'
 * @param {any} parsed parsed JSON body (or, for a 404 btc lookup, the sentinel {__httpStatus:404})
 * @returns {{verdict:string, detail:string}}
 */
export function interpretProbe(kind, parsed) {
  if (kind === 'evm') {
    if (parsed?.error) return { verdict: UNREACHABLE, detail: `rpc error: ${parsed.error.message ?? 'unknown'}` };
    const r = parsed?.result;
    if (r === null || r === undefined) return { verdict: FAILED, detail: 'no receipt (tx not found / dropped)' };
    if (r.status === '0x1' || r.status === 1) return { verdict: CONFIRMED, detail: `block ${parseInt(r.blockNumber, 16) || r.blockNumber}` };
    if (r.status === '0x0' || r.status === 0) return { verdict: FAILED, detail: 'receipt status 0x0 (reverted)' };
    return { verdict: UNREACHABLE, detail: 'receipt present but status field missing' };
  }
  if (kind === 'btc-esplora') {
    if (parsed?.__httpStatus === 404) return { verdict: FAILED, detail: 'tx not found (404)' };
    const confirmed = parsed?.status?.confirmed;
    if (confirmed === true) return { verdict: CONFIRMED, detail: `block ${parsed.status.block_height ?? '?'}` };
    if (confirmed === false) return { verdict: FAILED, detail: 'unconfirmed (mempool only)' };
    return { verdict: UNREACHABLE, detail: 'no status field in tx response' };
  }
  if (kind === 'solana') {
    if (parsed?.error) return { verdict: UNREACHABLE, detail: `rpc error: ${parsed.error.message ?? 'unknown'}` };
    const val = parsed?.result?.value;
    if (!Array.isArray(val)) return { verdict: UNREACHABLE, detail: 'malformed getSignatureStatuses response' };
    const st = val[0];
    if (st === null || st === undefined) return { verdict: FAILED, detail: 'signature not found' };
    if (st.err) return { verdict: FAILED, detail: `tx error: ${JSON.stringify(st.err)}` };
    const cs = st.confirmationStatus;
    if (cs === 'finalized' || cs === 'confirmed') return { verdict: CONFIRMED, detail: `slot ${st.slot ?? '?'} (${cs})` };
    return { verdict: UNREACHABLE, detail: `confirmationStatus=${cs ?? 'null'}` };
  }
  return { verdict: UNREACHABLE, detail: `unknown probe kind: ${kind}` };
}
