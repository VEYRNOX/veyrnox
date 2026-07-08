// lib/hiddenBalance.js
//
// MULTI-CHAIN BALANCE for a hidden (stealth) wallet — PRIVACY-AWARE.  PROVISIONAL.
//
// A revealed hidden wallet is a real BIP-39 wallet with an EVM, a BTC, and a SOL
// address (derived locally; see wallet-core/stealth.js). This module resolves the
// native testnet balance of any one of those addresses, REUSING the existing,
// mainnet-gated provider reads:
//   - EVM : getBalanceEth('sepolia', addr)      (eth_getBalance)
//   - BTC : getBalanceSats('testnet', addr)     (Esplora indexer)  -> BTC
//   - SOL : getBalanceSol('devnet', addr)       (Solana JSON-RPC)
// No new RPC/derivation logic; these are the SAME source-of-truth reads the rest
// of the wallet uses, so a number shown here matches what a block explorer shows.
//
// ───────────────────────────────────────────────────────────────────────────
// PRIVACY POSTURE — A HIDDEN-WALLET BALANCE QUERY IS A PHONE-HOME SURFACE
// ───────────────────────────────────────────────────────────────────────────
// Reading a balance contacts a third-party node (an RPC or an Esplora indexer).
// For a HIDDEN wallet that is sensitive: the query reveals one of its addresses
// to that node (and to a network observer), and checking ETH + BTC + SOL for the
// same revealed wallet across three providers could let those providers correlate
// the addresses as one identity. The wallet has no implemented private/local
// balance path today (no-telemetry / RPC-privacy routing are S4 roadmap items),
// so there is NO privacy-preserving read to route through yet.
//
// Given that, the deliberate design choice is: balance checks for hidden wallets
// are OPT-IN / MANUAL, never automatic. Revealing a hidden wallet does NOT fire a
// balance query (derivation is local and silent); the UI fetches a balance ONLY
// when the user explicitly asks, and tells them each check contacts that chain's
// public node. This keeps "reveal" network-silent and leaves the phone-home a
// conscious, per-check user action. When a private/local read path lands (S4),
// this module is the single place to route through it.
//
// HONEST LIMIT (must stay visible in-UI): stealth hides a wallet IN THE APP, not
// ON-CHAIN. Every address here is public; anyone who knows it can view its
// balance and history on an explorer. This holds equally for EVM, BTC and SOL.
//
// DEMO: a freshly created hidden address cannot hold live funds on a simulator,
// so demo balances are SEEDED per (chain,address) in localStorage and clearly
// labelled "demo — simulated". In real/native builds the balance is the live
// on-chain read above. Testnet only.

import { DEMO } from '@/api/demoClient';
import { getBalanceEth } from '@/wallet-core/evm/provider';
import { getBalanceSats } from '@/wallet-core/btc/provider';
import { getBalanceSol } from '@/wallet-core/sol/provider';
import { getNetworkInfo } from '@/wallet-core/evm/networks';
import { getBtcNetworkInfo } from '@/wallet-core/btc/networks';
import { getSolNetworkInfo } from '@/wallet-core/sol/networks';
import { isDeniabilitySessionActive } from '@/wallet-core/deniabilitySession.js';

// satoshis per BTC (BIP-84 testnet uses the same 1e8 base unit as mainnet).
const SATS_PER_BTC = 100_000_000;

// The three chains a hidden wallet spans, with the SAME testnet defaults the
// primary wallet uses. `read(address)` returns the native balance as a Number
// (display only); `explorer(address)` builds the public explorer URL.
export const HIDDEN_CHAINS = [
  {
    key: 'evm',
    label: 'Ethereum (EVM)',
    networkKey: 'sepolia',
    unit: 'ETH',
    read: async (a) => Number(await getBalanceEth('sepolia', a)),
    explorer: (a) => {
      const n = getNetworkInfo('sepolia');
      return n?.explorer ? `${n.explorer}/address/${a}` : null;
    },
    networkName: () => getNetworkInfo('sepolia')?.name || 'Sepolia',
  },
  {
    key: 'btc',
    label: 'Bitcoin',
    networkKey: 'testnet',
    unit: 'tBTC',
    read: async (a) => Number(await getBalanceSats('testnet', a)) / SATS_PER_BTC,
    explorer: (a) => {
      const n = getBtcNetworkInfo('testnet');
      return n?.explorer ? `${n.explorer}/address/${a}` : null;
    },
    networkName: () => getBtcNetworkInfo('testnet')?.name || 'Bitcoin Testnet',
  },
  {
    key: 'sol',
    label: 'Solana',
    networkKey: 'devnet',
    unit: 'SOL',
    read: async (a) => Number(await getBalanceSol('devnet', a)),
    explorer: (a) => {
      const n = getSolNetworkInfo('devnet');
      if (!n?.explorer) return null;
      const q = n.explorerCluster ? `?cluster=${n.explorerCluster}` : '';
      return `${n.explorer}/address/${a}${q}`;
    },
    networkName: () => getSolNetworkInfo('devnet')?.name || 'Solana Devnet',
  },
];

export function getHiddenChain(key) {
  return HIDDEN_CHAINS.find((c) => c.key === key) || null;
}

// localStorage namespace for DEMO seeded balances, keyed by `${chain}:${address}`
// -> amount string. DEMO-only: real/native never reads from here.
const DEMO_SEED_KEY = 'veyrnox-hidden-demo-balances';

function readDemoSeeds() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_SEED_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function seedId(chainKey, address) {
  return `${chainKey}:${String(address).toLowerCase()}`;
}

/** DEMO ONLY: seed/replace a plausible balance (string) for a (chain,address). */
export function seedDemoHiddenBalance(chainKey, address, amount) {
  if (!DEMO || !address) return;
  try {
    const all = readDemoSeeds();
    all[seedId(chainKey, address)] = String(amount);
    localStorage.setItem(DEMO_SEED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — demo seeding is best-effort, non-fatal. */
  }
}

/** DEMO ONLY: the seeded balance for a (chain,address) as a string ('0' if none). */
export function getDemoHiddenBalance(chainKey, address) {
  if (!address) return '0';
  return readDemoSeeds()[seedId(chainKey, address)] || '0';
}

/**
 * Resolve one chain's native balance for an address. PHONE-HOME on real/native
 * (a live node read); SEEDED in demo. Call ONLY in response to an explicit user
 * action (see module header on the opt-in posture).
 *
 * @param {string} chainKey - 'evm' | 'btc' | 'sol'
 * @param {string} address
 * @returns {Promise<{ amount: number, unit: string, source: 'demo-seed'|'chain' }>}
 */
export async function resolveHiddenBalance(chainKey, address) {
  // I3: a hidden-wallet balance is a live node read (phone-home). It must never
  // run inside a deniability session — fail closed on the exported function
  // itself (return null), not just on some callers, so a future caller can't
  // leak egress. Mirrors decoyBalance.js's guard.
  if (isDeniabilitySessionActive()) return null;
  const chain = getHiddenChain(chainKey);
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
  if (!address) return { amount: 0, unit: chain.unit, source: DEMO ? 'demo-seed' : 'chain' };
  if (DEMO) {
    return { amount: Number(getDemoHiddenBalance(chainKey, address)), unit: chain.unit, source: 'demo-seed' };
  }
  const amount = await chain.read(address); // live node read — phone-home
  return { amount, unit: chain.unit, source: 'chain' };
}
